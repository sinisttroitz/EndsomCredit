import { Loan, Installment, InstallmentFine } from '../types';

export const generateInstallments = (loanData: Loan, fines: InstallmentFine[] = []): Installment[] => {
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
    
    // Total Debt = installment_value * installments
    const totalDebt = (loanData.installment_value || 0) * (loanData.installments || 1);
    
    // Calculate actual base paid
    let actualPaidBase = 0;
    if (loanData.amount_paid !== undefined && loanData.amount_paid !== null) {
        actualPaidBase = Math.max(0, Number(loanData.amount_paid) - (Number(loanData.total_interest_paid) || 0));
    } else {
        // Fallback for missing amount_paid
        actualPaidBase = Math.max(0, totalDebt - Number(loanData.balance));
    }

    const trueAccumulatedInterest = Math.max(0, Number(loanData.balance) - totalDebt + actualPaidBase);
    const accumulatedInterestTotal = trueAccumulatedInterest;
    const totalPaid = actualPaidBase; // This is the amount that goes against the installments

    // Shift startDate BACKWARDS to recover the true original start date if it was advanced by processRecurringInterest
    if (accumulatedInterestTotal > 0 && loanData.interest_rate && loanData.amount) {
        const interestPerPeriod = (loanData.amount * (loanData.interest_rate / 100));
        if (interestPerPeriod > 0) {
            const periodsAdded = Math.round(accumulatedInterestTotal / interestPerPeriod);
            if (periodsAdded > 0) {
                if (loanData.frequency === 'Diária') {
                    startDate.setDate(startDate.getDate() - (periodsAdded * (loanData.installments || 1)));
                } else if (loanData.frequency === 'Semanal') {
                    startDate.setDate(startDate.getDate() - (periodsAdded * 7 * (loanData.installments || 1)));
                } else if (loanData.frequency === 'Quinzenal') {
                    startDate.setDate(startDate.getDate() - (periodsAdded * 15 * (loanData.installments || 1)));
                } else if (loanData.frequency === 'Mensal') {
                    startDate.setMonth(startDate.getMonth() - (periodsAdded * (loanData.installments || 1)));
                }
            }
        }
    }

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
        }

        if (loanData.balance <= 0) status = 'paid';

        let currentInstallmentValue = installmentValue;

        // Apply Fine Logic
        const fine = fines.find(f => f.installment_number === (i + 1));
        let finalValue = currentInstallmentValue;
        
        if (fine && status === 'late') {
            if (fine.fine_type === 'percent') {
                finalValue += (installmentValue * (fine.fine_value / 100));
            } else {
                finalValue += fine.fine_value;
            }
        }
        
        list.push({
            number: i + 1,
            date: date,
            value: finalValue,
            status: status,
            originalValue: installmentValue,
            accumulatedInterest: 0,
            originalDate: new Date(date), // Original date is the correctly backtracked date
            fine: fine
        });
    }

    // --- Post-pass: Distribute accumulated interest evenly across overdue installments ---
    if (accumulatedInterestTotal > 0) {
        const overdueInstallments = list.filter(i => i.status === 'late' || i.status === 'pending');
        if (overdueInstallments.length > 0) {
            const interestShare = accumulatedInterestTotal / overdueInstallments.length;
            for (const inst of overdueInstallments) {
                inst.accumulatedInterest = interestShare;
                inst.value += interestShare;
            }
        }
    }

    return list;
};
