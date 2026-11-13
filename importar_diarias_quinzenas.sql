-- ==============================================================================
-- IMPORTAÇÃO EM LOTE: 21 CLIENTES (DIÁRIAS E QUINZENAIS)
-- Capital Total: R$ 28.200,00 | Juros Total: R$ 9.998,00 | Saldo Devedor Total: R$ 26.254,50
-- ==============================================================================

-- 1. Garantir que as colunas necessárias existam
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS skip_holidays boolean DEFAULT true;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_balance numeric DEFAULT 0;

DO $$
DECLARE
    v_user_id UUID;
    v_client_id UUID;
    v_loan_id UUID;
    rec RECORD;
    v_contrato NUMERIC;
    v_juros NUMERIC;
    v_rate NUMERIC;
    v_pago NUMERIC;
    v_saldo NUMERIC;
    v_prog NUMERIC;
BEGIN
    -- 2. Localizar o usuário autenticado
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE LOWER(TRIM(email)) = LOWER('eliasjuniorsinisttro@gmail.com')
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário eliasjuniorsinisttro@gmail.com não encontrado em auth.users';
    END IF;

    -- 3. Tabela temporária para os 21 registros
    CREATE TEMP TABLE IF NOT EXISTS temp_import_diarias_quinzenas (
        name TEXT,
        cap NUMERIC,
        daily NUMERIC,
        paid_inst INT,
        total_inst INT,
        start_date DATE,
        credit_balance NUMERIC,
        freq TEXT,
        skip_sat BOOLEAN,
        skip_sun BOOLEAN,
        skip_hol BOOLEAN
    ) ON COMMIT DROP;

    TRUNCATE TABLE temp_import_diarias_quinzenas;

    INSERT INTO temp_import_diarias_quinzenas (
        name, cap, daily, paid_inst, total_inst, start_date, credit_balance, freq, skip_sat, skip_sun, skip_hol
    ) VALUES
        ('Wanderson Uber', 1300.00, 84.50, 14, 20, '2026-08-29', 68.00, 'Diária', false, true, true),
        ('Butieira', 2000.00, 230.00, 4, 10, '2026-10-23', 0.00, 'Diária', false, true, true),
        ('Eduardo', 480.00, 33.00, 4, 20, '2026-10-29', 0.00, 'Diária', false, true, true),
        ('Irmão do Chico do Regis', 500.00, 35.00, 7, 20, '2026-10-20', 0.00, 'Diária', false, true, true),
        ('Miriam', 1120.00, 78.00, 5, 20, '2026-10-28', 0.00, 'Diária', false, true, true),
        ('Edilson', 1900.00, 133.00, 0, 20, '2026-11-12', 0.00, 'Diária', false, true, true),
        ('Raquel', 1000.00, 70.00, 3, 20, '2026-10-29', 60.00, 'Diária', false, true, true),
        ('Ricardo Safadinho', 1000.00, 70.00, 6, 20, '2026-10-28', 0.00, 'Diária', false, true, true),
        ('Poliana', 1500.00, 975.00, 0, 2, '2026-11-06', 0.00, 'Quinzenal', false, false, false),
        ('Lucas do Roberto', 1000.00, 700.00, 0, 2, '2026-11-25', 0.00, 'Quinzenal', false, false, false),
        ('Marilania', 1500.00, 105.00, 2, 20, '2026-11-03', 0.00, 'Diária', false, true, true),
        ('Vanessa', 3000.00, 210.00, 17, 20, '2026-10-12', 0.00, 'Diária', false, true, true),
        ('Rosane', 1000.00, 70.00, 1, 20, '2026-11-10', 0.00, 'Diária', false, true, true),
        ('Gabriel', 1000.00, 70.00, 4, 20, '2026-10-20', 0.00, 'Diária', false, true, true),
        ('Diuana', 1000.00, 70.00, 12, 20, '2026-10-26', 0.00, 'Diária', false, true, true),
        ('Raimunda', 2000.00, 117.00, 13, 24, '2026-10-26', 0.00, 'Diária', false, true, true),
        ('Evandro', 2100.00, 105.00, 2, 24, '2026-10-27', 0.00, 'Diária', false, true, true),
        ('Juliana', 1500.00, 87.50, 9, 24, '2026-10-29', 61.00, 'Diária', false, true, true),
        ('João Victor', 1300.00, 50.00, 2, 37, '2026-10-26', 0.00, 'Diária', false, true, true),
        ('Daniel', 1000.00, 65.00, 11, 20, '2026-10-31', 0.00, 'Diária', false, true, true),
        ('Wagner', 1000.00, 70.00, 2, 20, '2026-10-10', 0.00, 'Diária', false, true, true);

    -- 4. Processar cada cliente e empréstimo
    FOR rec IN SELECT * FROM temp_import_diarias_quinzenas LOOP
        -- Cálculos financeiros
        v_contrato := rec.daily * rec.total_inst;
        v_juros := v_contrato - rec.cap;
        v_rate := ROUND((v_juros / rec.cap) * 100, 2);
        v_pago := rec.daily * rec.paid_inst;
        v_saldo := v_contrato - v_pago;
        IF rec.total_inst > 0 THEN
            v_prog := ROUND((rec.paid_inst::NUMERIC / rec.total_inst::NUMERIC) * 100);
        ELSE
            v_prog := 0;
        END IF;

        -- 4.1. Inserir ou atualizar cliente
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE user_id = v_user_id
          AND LOWER(TRIM(name)) = LOWER(TRIM(rec.name))
        LIMIT 1;

        IF v_client_id IS NULL THEN
            INSERT INTO public.clients (
                user_id,
                name,
                credit_balance,
                status,
                created_at
            ) VALUES (
                v_user_id,
                rec.name,
                rec.credit_balance,
                'active',
                (rec.start_date::text || ' 10:00:00-03')::timestamptz
            ) RETURNING id INTO v_client_id;
        ELSE
            UPDATE public.clients
            SET credit_balance = rec.credit_balance,
                status = 'active'
            WHERE id = v_client_id;
        END IF;

        -- 4.2. Inserir ou atualizar empréstimo
        SELECT id INTO v_loan_id
        FROM public.loans
        WHERE user_id = v_user_id
          AND client_id = v_client_id
          AND amount = rec.cap
          AND frequency = rec.freq
        LIMIT 1;

        IF v_loan_id IS NULL THEN
            INSERT INTO public.loans (
                client_id,
                user_id,
                amount,
                balance,
                interest_rate,
                installments,
                installment_value,
                due_date,
                status,
                frequency,
                skip_saturday,
                skip_sunday,
                skip_holidays,
                progress,
                amount_paid,
                total_interest_paid,
                created_at
            ) VALUES (
                v_client_id,
                v_user_id,
                rec.cap,
                v_saldo,
                v_rate,
                rec.total_inst,
                rec.daily,
                rec.start_date,
                'active',
                rec.freq,
                rec.skip_sat,
                rec.skip_sun,
                rec.skip_hol,
                v_prog,
                v_pago,
                0.00,
                (rec.start_date::text || ' 10:00:00-03')::timestamptz
            ) RETURNING id INTO v_loan_id;
        ELSE
            UPDATE public.loans
            SET balance = v_saldo,
                interest_rate = v_rate,
                installments = rec.total_inst,
                installment_value = rec.daily,
                due_date = rec.start_date,
                status = 'active',
                frequency = rec.freq,
                skip_saturday = rec.skip_sat,
                skip_sunday = rec.skip_sun,
                skip_holidays = rec.skip_hol,
                progress = v_prog,
                amount_paid = v_pago
            WHERE id = v_loan_id;
        END IF;

        -- 4.3. Inserir ou atualizar histórico de amortização se houver parcelas já pagas
        IF v_pago > 0 THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.loan_amortizations
                WHERE loan_id = v_loan_id
            ) THEN
                INSERT INTO public.loan_amortizations (
                    loan_id,
                    amount_paid,
                    principal_paid,
                    interest_paid,
                    fine_paid,
                    previous_balance,
                    new_balance,
                    created_at
                ) VALUES (
                    v_loan_id,
                    v_pago,
                    v_pago,
                    0.00,
                    0.00,
                    v_contrato,
                    v_saldo,
                    (rec.start_date::text || ' 12:00:00-03')::timestamptz
                );
            ELSE
                UPDATE public.loan_amortizations
                SET amount_paid = v_pago,
                    principal_paid = v_pago,
                    previous_balance = v_contrato,
                    new_balance = v_saldo
                WHERE loan_id = v_loan_id;
            END IF;
        END IF;

    END LOOP;

    RAISE NOTICE 'Importação dos 21 clientes concluída com sucesso!';
END $$;
