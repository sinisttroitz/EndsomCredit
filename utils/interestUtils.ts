import { supabase } from '../supabaseClient';
import { Loan } from '../types';

export const processRecurringInterest = async (loans: Loan[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const updates = [];

    for (const loan of loans) {
        if (loan.status === 'paid') continue;

        const [year, month, day] = loan.due_date.split('-').map(Number);
        const originalDueDate = new Date(year, month - 1, day);
        
        let periodsToAdd = 0;
        let nextDueDate = new Date(originalDueDate);

        // Calculate the term length of the loan
        const installments = loan.installments || 1;
        
        while (true) {
            let periodEndDate = new Date(nextDueDate);
            
            if (loan.frequency === 'Diária') {
                periodEndDate.setDate(nextDueDate.getDate() + installments);
            } else if (loan.frequency === 'Semanal') {
                periodEndDate.setDate(nextDueDate.getDate() + (installments * 7));
            } else if (loan.frequency === 'Quinzenal') {
                periodEndDate.setDate(nextDueDate.getDate() + (installments * 15));
            } else if (loan.frequency === 'Mensal') {
                periodEndDate.setMonth(nextDueDate.getMonth() + installments);
            } else {
                break;
            }

            // If today has reached or passed the end of the current term, add interest
            if (today >= periodEndDate) {
                periodsToAdd++;
                nextDueDate = periodEndDate;
            } else {
                break;
            }
        }

        if (periodsToAdd > 0) {
            const principal = Number(loan.amount);
            const rate = Number(loan.interest_rate) || 0;
            const interestPerPeriod = principal * (rate / 100);
            const totalInterestToAdd = periodsToAdd * interestPerPeriod;
            
            const newBalance = Number(loan.balance) + totalInterestToAdd;
            const newDueDateStr = `${nextDueDate.getFullYear()}-${(nextDueDate.getMonth() + 1).toString().padStart(2, '0')}-${nextDueDate.getDate().toString().padStart(2, '0')}`;

            const totalDebt = (Number(loan.installment_value) || 0) * (Number(loan.installments) || 1);
            let newProgress = 0;
            if (totalDebt > 0) {
                newProgress = Math.max(0, Math.min(100, Math.round(((totalDebt - newBalance) / totalDebt) * 100)));
            }

            updates.push(
                supabase
                    .from('loans')
                    .update({
                        balance: newBalance,
                        due_date: newDueDateStr,
                        progress: newProgress,
                        status: 'late' // If it reached here, it's definitely late for the previous period
                    })
                    .eq('id', loan.id)
            );
        }
    }

    if (updates.length > 0) {
        await Promise.all(updates);
        return true; // Indicates something was updated
    }
    return false;
};
