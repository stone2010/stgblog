import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://dbtdguasdbmlzpodfeht.supabase.co";

const supabaseKey =
  "sb_publishable_skyyIapm1MfIpT5R5NcleQ_-reVf604";

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);
