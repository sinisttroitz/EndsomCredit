-- ==============================================================================
-- IMPORTAÇÃO COMPLETA: CARTEIRA DO WANDERLEY (wanderleyagicred@gmail.com)
-- Total: 13 Clientes (Diárias, Quinzenal, Semanal, Mensais e Aluguel)
-- ==============================================================================

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
    -- 1. Localizar o usuário Wanderley em auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE LOWER(TRIM(email)) = LOWER('wanderleyagicred@gmail.com')
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário wanderleyagicred@gmail.com não encontrado em auth.users. Certifique-se de que a conta foi criada no sistema.';
    END IF;

    -- ==========================================================================
    -- PARTE 1: EMPRÉSTIMOS PARCELADOS (Diárias, Quinzenal e Semanal)
    -- ==========================================================================
    CREATE TEMP TABLE IF NOT EXISTS temp_import_parcelados_wanderley (
        name TEXT,
        cap NUMERIC,
        daily NUMERIC,
        paid_inst INT,
        total_inst INT,
        start_date DATE,
        contract_date DATE,
        credit_balance NUMERIC,
        freq TEXT,
        skip_sat BOOLEAN,
        skip_sun BOOLEAN,
        skip_hol BOOLEAN
    ) ON COMMIT DROP;

    TRUNCATE TABLE temp_import_parcelados_wanderley;

    INSERT INTO temp_import_parcelados_wanderley (
        name, cap, daily, paid_inst, total_inst, start_date, contract_date, credit_balance, freq, skip_sat, skip_sun, skip_hol
    ) VALUES
        -- 1. Williane: Quinzenal de 2x R$ 700 (15/11 e 30/11)
        ('Williane', 1000.00, 700.00, 0, 2, '2026-11-15', '2026-10-30', 0.00, 'Quinzenal', false, false, false),
        -- 2. Romilda Café: 20 diárias de R$ 70 - 10 pagas (R$ 700)
        ('Romilda Café', 1000.00, 70.00, 10, 20, '2026-10-26', '2026-10-26', 0.00, 'Diária', false, true, true),
        -- 3. Moisés: 20 diárias de R$ 35 - 16 pagas (R$ 560)
        ('Moisés', 500.00, 35.00, 16, 20, '2026-10-19', '2026-10-19', 0.00, 'Diária', false, true, true),
        -- 4. Simone: Semanal de 4x R$ 650 - 3 pagas (R$ 1.950)
        ('Simone', 2000.00, 650.00, 3, 4, '2026-10-26', '2026-10-16', 0.00, 'Semanal', false, false, false),
        -- 5. Niolanda: 20 diárias de R$ 70 - 2 pagas (R$ 140) + R$ 50 crédito
        ('Niolanda', 1000.00, 70.00, 2, 20, '2026-11-09', '2026-11-09', 50.00, 'Diária', false, true, true),
        -- 6. Theo: 20 diárias de R$ 63 - 4 pagas (R$ 252) + R$ 11 crédito
        ('Theo', 900.00, 63.00, 4, 20, '2026-10-28', '2026-10-28', 11.00, 'Diária', false, true, true),
        -- 7. John Michael: 20 diárias de R$ 52,50 - 5 pagas (R$ 262,50)
        ('John Michael', 700.00, 52.50, 5, 20, '2026-10-26', '2026-10-26', 0.00, 'Diária', false, true, true);

    FOR rec IN SELECT * FROM temp_import_parcelados_wanderley LOOP
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

        -- Inserir / Atualizar Cliente
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE user_id = v_user_id
          AND LOWER(TRIM(name)) = LOWER(TRIM(rec.name))
        LIMIT 1;

        IF v_client_id IS NULL THEN
            INSERT INTO public.clients (
                user_id, name, credit_balance, status, created_at
            ) VALUES (
                v_user_id, rec.name, rec.credit_balance, 'active',
                (COALESCE(rec.contract_date, rec.start_date)::text || ' 10:00:00-03')::timestamptz
            ) RETURNING id INTO v_client_id;
        ELSE
            UPDATE public.clients
            SET credit_balance = rec.credit_balance,
                status = 'active'
            WHERE id = v_client_id;
        END IF;

        -- Inserir / Atualizar Empréstimo
        SELECT id INTO v_loan_id
        FROM public.loans
        WHERE user_id = v_user_id
          AND client_id = v_client_id
          AND amount = rec.cap
          AND frequency = rec.freq
        LIMIT 1;

        IF v_loan_id IS NULL THEN
            INSERT INTO public.loans (
                client_id, user_id, amount, balance, interest_rate,
                installments, installment_value, due_date, status, frequency,
                skip_saturday, skip_sunday, skip_holidays, progress, amount_paid,
                total_interest_paid, created_at
            ) VALUES (
                v_client_id, v_user_id, rec.cap, v_saldo, v_rate,
                rec.total_inst, rec.daily, rec.start_date, 'active', rec.freq,
                rec.skip_sat, rec.skip_sun, rec.skip_hol, v_prog, v_pago,
                0.00,
                (COALESCE(rec.contract_date, rec.start_date)::text || ' 10:00:00-03')::timestamptz
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

        -- Amortização inicial se houver parcelas pagas
        IF v_pago > 0 THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.loan_amortizations
                WHERE loan_id = v_loan_id
            ) THEN
                INSERT INTO public.loan_amortizations (
                    loan_id, amount_paid, principal_paid, interest_paid, fine_paid,
                    previous_balance, new_balance, created_at
                ) VALUES (
                    v_loan_id, v_pago, v_pago, 0.00, 0.00,
                    v_contrato, v_saldo,
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

    -- ==========================================================================
    -- PARTE 2: EMPRÉSTIMOS MENSAIS E ACORDO
    -- ==========================================================================
    CREATE TEMP TABLE IF NOT EXISTS temp_import_mensais_wanderley (
        name TEXT,
        cap NUMERIC,
        total_debt NUMERIC,
        due_date DATE,
        contract_date DATE
    ) ON COMMIT DROP;

    TRUNCATE TABLE temp_import_mensais_wanderley;

    INSERT INTO temp_import_mensais_wanderley (
        name, cap, total_debt, due_date, contract_date
    ) VALUES
        -- 8. Rafael: Capital 1.200 | Juros R$ 240 (20%) | Vence 18/11
        ('Rafael', 1200.00, 1440.00, '2026-11-18', '2026-10-18'),
        -- 9. Tassio: Capital 1.000 | Juros R$ 250 (25%) | Vence 17/11
        ('Tassio', 1000.00, 1250.00, '2026-11-17', '2026-10-17'),
        -- 10. Raquel: Capital 1.500 | Juros R$ 450 (30%) | Vence 05/12
        ('Raquel', 1500.00, 1950.00, '2026-12-05', '2026-11-05'),
        -- 11. Luana: Capital 5.000 | Encargos R$ 3.000 | Acordo total R$ 8.000 | Vence 17/11
        ('Luana', 5000.00, 8000.00, '2026-11-17', '2026-06-05');

    FOR rec IN SELECT * FROM temp_import_mensais_wanderley LOOP
        v_contrato := rec.total_debt;
        v_juros := v_contrato - rec.cap;
        v_rate := ROUND((v_juros / rec.cap) * 100, 2);

        -- Inserir / Atualizar Cliente
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE user_id = v_user_id
          AND LOWER(TRIM(name)) = LOWER(TRIM(rec.name))
        LIMIT 1;

        IF v_client_id IS NULL THEN
            INSERT INTO public.clients (
                user_id, name, credit_balance, status, created_at
            ) VALUES (
                v_user_id, rec.name, 0.00, 'active',
                (rec.contract_date::text || ' 10:00:00-03')::timestamptz
            ) RETURNING id INTO v_client_id;
        ELSE
            UPDATE public.clients
            SET status = 'active'
            WHERE id = v_client_id;
        END IF;

        -- Inserir / Atualizar Empréstimo
        SELECT id INTO v_loan_id
        FROM public.loans
        WHERE user_id = v_user_id
          AND client_id = v_client_id
          AND amount = rec.cap
          AND frequency = 'Mensal'
        LIMIT 1;

        IF v_loan_id IS NULL THEN
            INSERT INTO public.loans (
                client_id, user_id, amount, balance, interest_rate,
                installments, installment_value, due_date, status, frequency,
                skip_saturday, skip_sunday, skip_holidays, progress, amount_paid,
                total_interest_paid, created_at
            ) VALUES (
                v_client_id, v_user_id, rec.cap, v_contrato, v_rate,
                1, v_contrato, rec.due_date, 'active', 'Mensal',
                false, false, false, 0, 0.00,
                0.00,
                (rec.contract_date::text || ' 10:00:00-03')::timestamptz
            );
        ELSE
            UPDATE public.loans
            SET balance = v_contrato,
                interest_rate = v_rate,
                installments = 1,
                installment_value = v_contrato,
                due_date = rec.due_date,
                status = 'active',
                frequency = 'Mensal',
                skip_saturday = false,
                skip_sunday = false,
                skip_holidays = false
            WHERE id = v_loan_id;
        END IF;
    END LOOP;

    -- ==========================================================================
    -- PARTE 3: EMPRÉSTIMOS DE ALUGUEL DO DINHEIRO (Patrick e Júlio César)
    -- ==========================================================================
    CREATE TEMP TABLE IF NOT EXISTS temp_import_aluguel_wanderley (
        name TEXT,
        cap NUMERIC,
        daily_rent NUMERIC,
        total_rent_paid NUMERIC,
        start_date DATE
    ) ON COMMIT DROP;

    TRUNCATE TABLE temp_import_aluguel_wanderley;

    INSERT INTO temp_import_aluguel_wanderley (
        name, cap, daily_rent, total_rent_paid, start_date
    ) VALUES
        -- 12. Patrick: Capital R$ 500 | Diária R$ 8,00 | R$ 104 pagos (13 diárias quitadas até 09/11)
        ('Patrick', 500.00, 8.00, 104.00, '2026-10-24'),
        -- 13. Júlio César: Capital R$ 1.500 | Diária R$ 23,00 | R$ 425 pagos
        ('Júlio César', 1500.00, 23.00, 425.00, '2026-10-19');

    FOR rec IN SELECT * FROM temp_import_aluguel_wanderley LOOP
        v_rate := ROUND((rec.daily_rent / rec.cap) * 100, 2);

        -- Inserir / Atualizar Cliente
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE user_id = v_user_id
          AND LOWER(TRIM(name)) = LOWER(TRIM(rec.name))
        LIMIT 1;

        IF v_client_id IS NULL THEN
            INSERT INTO public.clients (
                user_id, name, credit_balance, status, created_at
            ) VALUES (
                v_user_id, rec.name, 0.00, 'active',
                (rec.start_date::text || ' 10:00:00-03')::timestamptz
            ) RETURNING id INTO v_client_id;
        ELSE
            UPDATE public.clients
            SET status = 'active'
            WHERE id = v_client_id;
        END IF;

        -- Inserir / Atualizar Empréstimo de Aluguel
        SELECT id INTO v_loan_id
        FROM public.loans
        WHERE user_id = v_user_id
          AND client_id = v_client_id
          AND amount = rec.cap
          AND frequency = 'Aluguel'
        LIMIT 1;

        IF v_loan_id IS NULL THEN
            INSERT INTO public.loans (
                client_id, user_id, amount, balance, interest_rate,
                installments, installment_value, due_date, status, frequency,
                skip_saturday, skip_sunday, skip_holidays, progress, amount_paid,
                total_interest_paid, created_at
            ) VALUES (
                v_client_id, v_user_id, rec.cap, rec.cap, v_rate,
                1, rec.daily_rent, rec.start_date, 'active', 'Aluguel',
                false, true, true, 0, 0.00,
                rec.total_rent_paid,
                (rec.start_date::text || ' 10:00:00-03')::timestamptz
            ) RETURNING id INTO v_loan_id;
        ELSE
            UPDATE public.loans
            SET balance = rec.cap,
                interest_rate = v_rate,
                installments = 1,
                installment_value = rec.daily_rent,
                due_date = rec.start_date,
                status = 'active',
                frequency = 'Aluguel',
                skip_saturday = false,
                skip_sunday = true,
                skip_holidays = true,
                amount_paid = 0.00,
                total_interest_paid = rec.total_rent_paid
            WHERE id = v_loan_id;
        END IF;

        -- Inserir histórico de amortização para o aluguel já recebido
        IF rec.total_rent_paid > 0 THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.loan_amortizations
                WHERE loan_id = v_loan_id
            ) THEN
                INSERT INTO public.loan_amortizations (
                    loan_id, amount_paid, principal_paid, interest_paid, fine_paid,
                    previous_balance, new_balance, created_at
                ) VALUES (
                    v_loan_id, rec.total_rent_paid, 0.00, rec.total_rent_paid, 0.00,
                    rec.cap, rec.cap,
                    (rec.start_date::text || ' 12:00:00-03')::timestamptz
                );
            ELSE
                UPDATE public.loan_amortizations
                SET amount_paid = rec.total_rent_paid,
                    interest_paid = rec.total_rent_paid,
                    principal_paid = 0.00,
                    previous_balance = rec.cap,
                    new_balance = rec.cap
                WHERE loan_id = v_loan_id;
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE 'Importação dos 13 clientes do Wanderley concluída com sucesso!';
END $$;
