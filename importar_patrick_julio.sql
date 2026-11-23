-- ==============================================================================
-- IMPORTAÇÃO: PATRICK E JÚLIO CÉSAR (ALUGUEL / DIÁRIAS) - WANDERLEY
-- Usuário: wanderleyagicred@gmail.com
-- ==============================================================================

DO $$
DECLARE
    v_user_id UUID;
    v_client_id UUID;
    v_loan_id UUID;
    rec RECORD;
    v_rate NUMERIC;
BEGIN
    -- 1. Localizar o usuário Wanderley em auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE LOWER(TRIM(email)) = LOWER('wanderleyagicred@gmail.com')
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário wanderleyagicred@gmail.com não encontrado em auth.users.';
    END IF;

    -- 2. Tabela temporária apenas para os dois de diária/aluguel
    CREATE TEMP TABLE IF NOT EXISTS temp_import_aluguel_wanderley_apenas (
        name TEXT,
        cap NUMERIC,
        daily_rent NUMERIC,
        total_rent_paid NUMERIC,
        start_date DATE
    ) ON COMMIT DROP;

    TRUNCATE TABLE temp_import_aluguel_wanderley_apenas;

    INSERT INTO temp_import_aluguel_wanderley_apenas (
        name, cap, daily_rent, total_rent_paid, start_date
    ) VALUES
        -- Patrick: Capital R$ 500,00 | Diária R$ 8,00 | R$ 104,00 pagos (13 diárias quitadas)
        ('Patrick', 500.00, 8.00, 104.00, '2026-10-24'),
        -- Júlio César: Capital R$ 1.500,00 | Diária R$ 23,00 | R$ 425,00 pagos
        ('Júlio César', 1500.00, 23.00, 425.00, '2026-10-19');

    FOR rec IN SELECT * FROM temp_import_aluguel_wanderley_apenas LOOP
        v_rate := ROUND((rec.daily_rent / rec.cap) * 100, 2);

        -- 2.1. Inserir ou atualizar cliente
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

        -- 2.2. Inserir ou atualizar empréstimo de Aluguel
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

        -- 2.3. Inserir histórico de amortização para o aluguel já recebido
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

    RAISE NOTICE 'Patrick e Júlio César importados com sucesso para wanderleyagicred@gmail.com!';
END $$;
