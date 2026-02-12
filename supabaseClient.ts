import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wjltsjvdcbrbsunpsqwz.supabase.co';
const supabaseKey = 'sb_publishable_1lszTS7-eZrKA-M1GN0zWw_o-nwRGz5';

export const supabase = createClient(supabaseUrl, supabaseKey);