ALTER TABLE boulangeries DROP CONSTRAINT IF EXISTS boulangeries_plan_check;
ALTER TABLE boulangeries ADD CONSTRAINT boulangeries_plan_check CHECK (plan IN ('starter', 'pro', 'multi', 'trial'));
ALTER TABLE boulangeries ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ DEFAULT NULL;