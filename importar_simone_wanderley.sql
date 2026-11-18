-- ==============================================================================
-- IMPORTAÇÃO: SIMONE - WANDERLEY (wanderleyagicred@gmail.com)
-- Modalidade: Semanal (4x R$ 650,00 | 3 pagas = R$ 1.950,00 | Saldo = R$ 650,00)
-- ==============================================================================

DO $$
DECLARE
    v_user_id UUID;
    v_client_id UUID;
    v_loan_id UUID;
    v_contrato NUMERIC := 2600.00;
    v_cap NUMERIC := 2000.00;
    v_juros NUMERIC := 600.00;
    v_rate NUMERIC := 30.00;
    v_pago NUMERIC := 1950.00;
    v_saldo NUMERIC := 650.00;
    v_prog NUMERIC := 75; -- 3 de 4 pagas (75%)
BEGIN
    -- 1. Localizar o usuário Wanderley em auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE LOWER(TRIM(email)) = LOWER('wanderleyagicred@gmail.com')
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário wanderleyagicred@gmail.com não encontrado em auth.users.';
    END IF;

    -- 2. Inserir ou atualizar cliente Simone
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE user_id = v_user_id
      AND LOWER(TRIM(name)) = LOWER('Simone')
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
            'Simone',
            0.00,
            'active',
            '2026-10-16 10:00:00-03'::timestamptz
        ) RETURNING id INTO v_client_id;
    ELSE
        UPDATE public.clients
        SET status = 'active'
        WHERE id = v_client_id;
    END IF;

    -- 3. Inserir ou atualizar empréstimo Semanal da Simone
    SELECT id INTO v_loan_id
    FROM public.loans
    WHERE user_id = v_user_id
      AND client_id = v_client_id
      AND amount = v_cap
      AND frequency = 'Semanal'
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
            v_cap,
            v_saldo,
            v_rate,
            4,
            650.00,
            '2026-10-23', -- 1ª semana venceu 23/10, 2ª 30/10, 3ª 06/11 (todas pagas), 4ª 13/11
            'active',
            'Semanal',
            false,
            false,
            false,
            v_prog,
            v_pago,
            0.00,
            '2026-10-16 10:00:00-03'::timestamptz
        ) RETURNING id INTO v_loan_id;
    ELSE
        UPDATE public.loans
        SET balance = v_saldo,
            interest_rate = v_rate,
            installments = 4,
            installment_value = 650.00,
            due_date = '2026-10-23',
            status = 'active',
            frequency = 'Semanal',
            progress = v_prog,
            amount_paid = v_pago
        WHERE id = v_loan_id;
    END IF;

    -- 4. Registrar histórico de amortização das 3 parcelas já pagas (R$ 1.950,00)
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
            '2026-11-06 12:00:00-03'::timestamptz
        );
    ELSE
        UPDATE public.loan_amortizations
        SET amount_paid = v_pago,
            principal_paid = v_pago,
            previous_balance = v_contrato,
            new_balance = v_saldo
        WHERE loan_id = v_loan_id;
    END IF;

    RAISE NOTICE 'Simone importada com sucesso para wanderleyagicred@gmail.com!';
END $$;
