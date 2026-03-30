-- Schema for Portfolio Tracker with Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Authentication already provided by Supabase Auth
-- We'll create tables that integrate with auth

-- Users Profile table - extends Supabase auth
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Automatic linking of profiles to auth.users
CREATE OR REPLACE FUNCTION public.create_profile_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER create_profile_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_user();

-- Brokers table
CREATE TABLE brokers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  credentials JSONB, -- Encrypted credentials if needed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Securities table (stocks, ETFs, etc.)
CREATE TABLE securities (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_class TEXT NOT NULL, -- Equity, Fixed Income, etc.
  sector TEXT,
  country TEXT,
  currency TEXT NOT NULL,
  exchange TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(symbol, exchange)
);

-- Holdings table
CREATE TABLE holdings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  security_id UUID REFERENCES securities(id) ON DELETE CASCADE NOT NULL,
  broker_id UUID REFERENCES brokers(id) ON DELETE SET NULL,
  quantity DECIMAL(19, 8) NOT NULL,
  average_price DECIMAL(19, 8),
  current_price DECIMAL(19, 8),
  cost_basis DECIMAL(19, 8),
  market_value DECIMAL(19, 8),
  unrealized_gain DECIMAL(19, 8),
  currency TEXT NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(user_id, security_id, broker_id)
);

-- Activities table (trades, dividends, deposits, withdrawals)
CREATE TABLE activities (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  security_id UUID REFERENCES securities(id) ON DELETE CASCADE,
  broker_id UUID REFERENCES brokers(id) ON DELETE SET NULL,
  type TEXT NOT NULL, -- BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, etc.
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  quantity DECIMAL(19, 8),
  price DECIMAL(19, 8),
  total_amount DECIMAL(19, 8) NOT NULL,
  fees DECIMAL(19, 8),
  currency TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Performance tracking table (daily/monthly/yearly snapshots)
CREATE TABLE portfolio_snapshots (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  total_value DECIMAL(19, 8) NOT NULL,
  daily_change DECIMAL(19, 8),
  daily_change_percent DECIMAL(19, 8),
  total_cost DECIMAL(19, 8),
  total_gain DECIMAL(19, 8),
  total_gain_percent DECIMAL(19, 8),
  cash_balance DECIMAL(19, 8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(user_id, date)
);

-- Settings table
CREATE TABLE user_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  default_currency TEXT NOT NULL DEFAULT 'USD',
  theme TEXT DEFAULT 'light',
  notification_preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(user_id)
);

-- Row Level Security Policies
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE securities ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Profiles - users can only see and update their own profile
CREATE POLICY "Users can view own profile" 
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Brokers - users can only see and manage their own brokers
CREATE POLICY "Users can view own brokers" 
  ON brokers FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own brokers" 
  ON brokers FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brokers" 
  ON brokers FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own brokers" 
  ON brokers FOR DELETE USING (auth.uid() = user_id);

-- Securities - all authenticated users can view securities
CREATE POLICY "All users can view securities" 
  ON securities FOR SELECT USING (auth.role() = 'authenticated');

-- Holdings - users can only see and manage their own holdings
CREATE POLICY "Users can view own holdings" 
  ON holdings FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own holdings" 
  ON holdings FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own holdings" 
  ON holdings FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own holdings" 
  ON holdings FOR DELETE USING (auth.uid() = user_id);

-- Activities - users can only see and manage their own activities
CREATE POLICY "Users can view own activities" 
  ON activities FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activities" 
  ON activities FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own activities" 
  ON activities FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own activities" 
  ON activities FOR DELETE USING (auth.uid() = user_id);

-- Portfolio Snapshots - users can only see their own snapshots
CREATE POLICY "Users can view own portfolio snapshots" 
  ON portfolio_snapshots FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own portfolio snapshots" 
  ON portfolio_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User Settings - users can only see and manage their own settings
CREATE POLICY "Users can view own settings" 
  ON user_settings FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own settings" 
  ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" 
  ON user_settings FOR UPDATE USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_holdings_user_id ON holdings(user_id);
CREATE INDEX idx_activities_user_id ON activities(user_id);
CREATE INDEX idx_activities_date ON activities(date);
CREATE INDEX idx_portfolio_snapshots_user_id_date ON portfolio_snapshots(user_id, date);
CREATE INDEX idx_securities_symbol ON securities(symbol); 