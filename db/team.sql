-- IWMP & V5 team roster (account_id -> display_name, team).
-- Muhammad Usama Ejaz has two Atlassian accounts; both map to one name so his stats merge.
-- team is 'Dev' or 'QA'. Re-runnable. To change membership, edit here and re-run `npm run db:setup`.
INSERT INTO team_members (account_id, display_name, team) VALUES
  ('712020:260093b9-66e0-414a-89f3-c18dd805f7a3', 'Muhammad Usama Ejaz', 'Dev'),
  ('712020:9b7bf909-480b-41b6-9758-b81ef62458f3', 'Muhammad Usama Ejaz', 'Dev'),
  ('712020:4702d7e2-10f2-4844-9b82-203ad48dadda', 'Sherdil Lodhi',       'Dev'),
  ('712020:f011339d-9fef-432a-8dd3-3a2a00d97a54', 'Ameer Hamza',         'Dev'),
  ('712020:860adce1-c53b-4a4b-b72b-7f644976cf7e', 'Muhammad Basit',      'Dev'),
  ('617f32cdb9c549006f3696f0',                    'waqas.khadim',        'Dev'),
  ('712020:f34f9ebe-f11b-498b-a44b-67ff390944f1', 'Nabeel Anwar',        'Dev'),
  ('712020:1776b679-d2aa-4cde-85e8-c61a362dd617', 'Masoom Raza',         'Dev'),
  ('712020:689bd0b0-b7a5-47ca-a229-4b2fc5f5ece9', 'Muhammad Ali Janjua', 'Dev'),
  ('712020:81001409-c408-4153-9316-4dca8d8a4d46', 'Ali Rizwan Tariq',    'Dev'),
  ('712020:0ad63599-14ba-4a5e-af95-521f212454d0', 'Hassan Mujtaba',      'Dev'),
  ('712020:30619f9f-3169-4b8e-aff0-4957d793f3ac', 'Rehman Ali',          'Dev'),
  ('712020:0634bd0d-47f5-400f-b188-8abd96ca8221', 'Shahzad Hamza',       'Dev'),
  ('712020:3da0f8d2-0775-4fb0-915b-b9c60f4da372', 'Muhammad Sheheryar',  'Dev'),
  ('712020:e6b27d51-8c89-4b21-994d-a1c6b469271c', 'Awais Ali',           'QA'),
  ('712020:04156042-4364-4d66-8869-3bb3bd1cef95', 'Ihtisham Zaffar',     'QA'),
  ('712020:612b90da-7770-414e-9590-2c2ba8229dbe', 'Muhammad Owais',      'QA')
ON CONFLICT (account_id) DO UPDATE SET display_name = EXCLUDED.display_name, team = EXCLUDED.team;
