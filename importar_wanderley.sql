-- ==============================================================================
-- IMPORTAÇÃO EM LOTE: CLIENTES DO WANDERLEY (wanderleyagicred@gmail.com)
-- Clientes: Williane, Romilda Café, Moisés
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
        RAISE EXCEPTION 'Usuário wanderleyagicred@gmail.com não encontrado em auth.users. Verifique se o cadastro dele já foi criado.';
    END IF;

    -- 2. Tabela temporária com os registros validados
    CREATE TEMP TABLE IF NOT EXISTS temp_import_wanderley (
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

    TRUNCATE TABLE temp_import_wanderley;

    INSERT INTO temp_import_wanderley (
        name, cap, daily, paid_inst, total_inst, start_date, contract_date, credit_balance, freq, skip_sat, skip_sun, skip_hol
    ) VALUES
        -- Williane: Quinzenal de 2x R$ 700 (15/11 e 30/11) - D/E: 30/10/2026
        ('Williane', 1000.00, 700.00, 0, 2, '2026-11-15', '2026-10-30', 0.00, 'Quinzenal', false, false, false),
        -- Romilda Café: 20 diárias de R$ 70 - 10 pagas (R$ 700) - Início: 26/10/2026
        ('Romilda Café', 1000.00, 70.00, 10, 20, '2026-10-26', '2026-10-26', 0.00, 'Diária', false, true, true),
        -- Moisés: 20 diárias de R$ 35 - 16 pagas (R$ 560) - Início: 19/10/2026
        ('Moisés', 500.00, 35.00, 16, 20, '2026-10-19', '2026-10-19', 0.00, 'Diária', false, true, true);

    -- 3. Processar cada cliente e empréstimo
    FOR rec IN SELECT * FROM temp_import_wanderley LOOP
        -- Cálculos financeiros automáticos
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
                (COALESCE(rec.contract_date, rec.start_date)::text || ' 10:00:00-03')::timestamptz
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

        -- 3.3. Inserir ou atualizar histórico de amortização para parcelas já pagas
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

    RAISE NOTICE 'Importação concluída com sucesso para o usuário wanderleyagicred@gmail.com!';
END $$;
