-- ==============================================================================
-- IMPORTAÇÃO EM LOTE: MENSAIS E ACORDO - WANDERLEY (wanderleyagicred@gmail.com)
-- Clientes: Rafael, Tassio, Raquel, Luana
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
        RAISE EXCEPTION 'Usuário wanderleyagicred@gmail.com não encontrado em auth.users.';
    END IF;

    -- 2. Tabela temporária para os 4 contratos mensais
    CREATE TEMP TABLE IF NOT EXISTS temp_import_mensais_wanderley (
        name TEXT,
        cap NUMERIC,
        total_debt NUMERIC,
        paid_inst INT,
        total_inst INT,
        due_date DATE,
        contract_date DATE,
        credit_balance NUMERIC,
        freq TEXT,
        skip_sat BOOLEAN,
        skip_sun BOOLEAN,
        skip_hol BOOLEAN
    ) ON COMMIT DROP;

    TRUNCATE TABLE temp_import_mensais_wanderley;

    INSERT INTO temp_import_mensais_wanderley (
        name, cap, total_debt, paid_inst, total_inst, due_date, contract_date, credit_balance, freq, skip_sat, skip_sun, skip_hol
    ) VALUES
        -- Rafael: Capital 1.200 | Juros 20% (R$ 240) | Total quitação 1.440 | Vence 18/11/2026
        ('Rafael', 1200.00, 1440.00, 0, 1, '2026-11-18', '2026-10-18', 0.00, 'Mensal', false, false, false),
        -- Tassio: Capital 1.000 | Juros 25% (R$ 250) | Total quitação 1.250 | Vence 17/11/2026 (Amanhã)
        ('Tassio', 1000.00, 1250.00, 0, 1, '2026-11-17', '2026-10-17', 0.00, 'Mensal', false, false, false),
        -- Raquel: Capital 1.500 | Juros 30% (R$ 450) | Total quitação 1.950 | Vence 05/12/2026
        ('Raquel', 1500.00, 1950.00, 0, 1, '2026-12-05', '2026-11-05', 0.00, 'Mensal', false, false, false),
        -- Luana: Capital 5.000 | Encargos 3.000 (60%) | Acordo total 8.000 | Vence 17/11/2026 (Amanhã) - Início em 05/06
        ('Luana', 5000.00, 8000.00, 0, 1, '2026-11-17', '2026-06-05', 0.00, 'Mensal', false, false, false);

    -- 3. Processar cada cliente e empréstimo
    FOR rec IN SELECT * FROM temp_import_mensais_wanderley LOOP
        v_contrato := rec.total_debt;
        v_juros := v_contrato - rec.cap;
        v_rate := ROUND((v_juros / rec.cap) * 100, 2);
        v_pago := 0.00;
        v_saldo := v_contrato;
        v_prog := 0;

        -- 3.1. Inserir ou atualizar cliente
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
                (rec.contract_date::text || ' 10:00:00-03')::timestamptz
            ) RETURNING id INTO v_client_id;
        ELSE
            UPDATE public.clients
            SET credit_balance = rec.credit_balance,
                status = 'active'
            WHERE id = v_client_id;
        END IF;

        -- 3.2. Inserir ou atualizar empréstimo
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
                v_contrato,
                rec.due_date,
                'active',
                rec.freq,
                rec.skip_sat,
                rec.skip_sun,
                rec.skip_hol,
                v_prog,
                v_pago,
                0.00,
                (rec.contract_date::text || ' 10:00:00-03')::timestamptz
            ) RETURNING id INTO v_loan_id;
        ELSE
            UPDATE public.loans
            SET balance = v_saldo,
                interest_rate = v_rate,
                installments = rec.total_inst,
                installment_value = v_contrato,
                due_date = rec.due_date,
                status = 'active',
                frequency = rec.freq,
                skip_saturday = rec.skip_sat,
                skip_sunday = rec.skip_sun,
                skip_holidays = rec.skip_hol,
                progress = v_prog,
                amount_paid = v_pago
            WHERE id = v_loan_id;
        END IF;

    END LOOP;

    RAISE NOTICE 'Importação dos 4 contratos mensais concluída com sucesso para wanderleyagicred@gmail.com!';
END $$;
