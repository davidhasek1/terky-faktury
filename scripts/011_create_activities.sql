-- Aktivity (deník služeb pro zákazníky) a jejich služby
-- Mirrors invoices + invoice_items pattern with RLS scoped to user_id.

-- Enums
CREATE TYPE service_type AS ENUM ('cleaning', 'laundry', 'apartment_service');
CREATE TYPE activity_status AS ENUM ('unpaid', 'paid');

-- Activities table
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  status activity_status NOT NULL DEFAULT 'unpaid',
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Activity services (line items per activity)
CREATE TABLE IF NOT EXISTS activity_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  service_type service_type NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  note TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activities_user_customer_date
  ON activities (user_id, customer_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_activity_services_activity_id
  ON activity_services (activity_id);

-- Enable Row Level Security
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_services ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent rerun)
DROP POLICY IF EXISTS "Users can view their own activities" ON activities;
DROP POLICY IF EXISTS "Users can insert their own activities" ON activities;
DROP POLICY IF EXISTS "Users can update their own activities" ON activities;
DROP POLICY IF EXISTS "Users can delete their own activities" ON activities;

DROP POLICY IF EXISTS "Users can view their own activity services" ON activity_services;
DROP POLICY IF EXISTS "Users can insert their own activity services" ON activity_services;
DROP POLICY IF EXISTS "Users can update their own activity services" ON activity_services;
DROP POLICY IF EXISTS "Users can delete their own activity services" ON activity_services;

-- Activities policies
CREATE POLICY "Users can view their own activities" ON activities
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activities" ON activities
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own activities" ON activities
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own activities" ON activities
  FOR DELETE USING (auth.uid() = user_id);

-- Activity services policies (access via parent activity ownership)
CREATE POLICY "Users can view their own activity services" ON activity_services
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM activities
      WHERE activities.id = activity_services.activity_id
      AND activities.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own activity services" ON activity_services
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM activities
      WHERE activities.id = activity_services.activity_id
      AND activities.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own activity services" ON activity_services
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM activities
      WHERE activities.id = activity_services.activity_id
      AND activities.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own activity services" ON activity_services
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM activities
      WHERE activities.id = activity_services.activity_id
      AND activities.user_id = auth.uid()
    )
  );

-- Auto-update updated_at on activities (function defined in 001_create_tables.sql)
DROP TRIGGER IF EXISTS update_activities_updated_at ON activities;
CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
