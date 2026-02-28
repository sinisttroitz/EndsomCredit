import { Loan, Installment } from '../types';

export const generateInstallments = (loanData: Loan): Installment[] => {
    const count = loanData.installments || 1;
    const installmentValue = loanData.installment_value || (loanData.amount / count);
    
    // Fix date parsing to avoid timezone issues
    let startDate: Date;
    if (loanData.due_date) {
        const [year, month, day] = loanData.due_date.split('-').map(Number);
        startDate = new Date(year, month - 1, day);
    } else {
        startDate = new Date(loanData.created_at || Date.now());
    }
    
    // Simple logic to determine how many paid based on balance
    // Total Debt = installment_value * installments
    const totalDebt = (loanData.installment_value || 0) * (loanData.installments || 1);
    const totalPaid = totalDebt - Number(loanData.balance);
    const list: Installment[] = [];

    let paidAccumulator = 0;
    let dailyDateTracker = new Date(startDate);

    for (let i = 0; i < count; i++) {
        let date: Date;

        if (loanData.frequency === 'Diária') {
            if (i === 0) {
                date = new Date(startDate);
            } else {
                date = new Date(dailyDateTracker);
                date.setDate(date.getDate() + 1);
                
                while (true) {
                    const day = date.getDay();
                    if (loanData.skip_saturday && day === 6) {
                        date.setDate(date.getDate() + 1);
                        continue;
                    }
                    if (loanData.skip_sunday && day === 0) {
                        date.setDate(date.getDate() + 1);
                        continue;
                    }
                    break;
                }
            }
            dailyDateTracker = new Date(date);
        } else {
            date = new Date(startDate);
            if (loanData.frequency === 'Semanal') {
                date.setDate(startDate.getDate() + (i * 7));
            } else if (loanData.frequency === 'Quinzenal') {
                date.setDate(startDate.getDate() + (i * 15));
            } else {
                date.setMonth(startDate.getMonth() + i);
            }
        }
        
        let status: 'paid' | 'pending' | 'late' | 'future' = 'future';
        
        // Check if this installment is "covered" by the totalPaid amount
        // Use a small epsilon for float comparison
        if (paidAccumulator + (installmentValue * 0.99) < totalPaid) {
            status = 'paid';
            paidAccumulator += installmentValue;
        } else {
                // Not paid
                const today = new Date();
                // Reset time part for accurate date comparison
                const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const dateZero = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                
                if (dateZero < todayZero) status = 'late';
                else if (dateZero.getTime() === todayZero.getTime()) status = 'pending';
                else status = 'future';
                
                // Do NOT increase paidAccumulator, so next installments also fall into this block
        }

        if (loanData.balance <= 0) status = 'paid';

        list.push({
            number: i + 1,
            date: date,
            value: installmentValue,
            status: status
        });
    }
    return list;
};
