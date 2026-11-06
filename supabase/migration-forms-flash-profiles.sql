-- Kwickly: per-service booking forms, Flash (emergency) services, profiles, contact details.
-- Run ONCE in Supabase -> SQL Editor, AFTER schema.sql and migration-billing-earnings.sql. Safe to run again.
--
--   1. profiles       : phone, default address, profile photo (+ update_my_profile)
--   2. services       : is_flash + form_fields (admin-editable form builder), seeded forms for every service
--   3. bookings       : answers to the service form, flash flag, alternate mobile, map link, contact name
--   4. flash services : four example emergency services (admin can edit / delete them)

-- ───────────────────────── 1. profiles ─────────────────────────
alter table public.profiles add column if not exists phone      text not null default '';
alter table public.profiles add column if not exists address    text not null default '';
alter table public.profiles add column if not exists avatar_url text;

-- Mobile number is collected at sign-up and stored on the profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    'customer',
    left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g'), 12)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- People edit their own name / mobile / default address / photo here. Role can never change this way.
create or replace function public.update_my_profile(p_name text, p_phone text, p_address text, p_avatar text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_name  text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  if char_length(v_name) < 2 then raise exception 'Please enter your name'; end if;
  if char_length(v_phone) > 10 then v_phone := right(v_phone, 10); end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number'; end if;
  if p_avatar is not null and p_avatar !~* '^https://' then raise exception 'Invalid photo link'; end if;

  update public.profiles
  set full_name = left(v_name, 80), phone = v_phone, address = left(trim(coalesce(p_address, '')), 500), avatar_url = p_avatar
  where id = auth.uid();

  -- keep the provider's name on their open jobs in sync
  update public.bookings set provider_name = left(v_name, 80)
  where provider_id = auth.uid() and status in ('assigned', 'in_progress');
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;

-- Public bucket for profile photos (2 MB, images). Each person can only write inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "avatars: upload own" on storage.objects;
create policy "avatars: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: delete own" on storage.objects;
create policy "avatars: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────────────────── 2. services: flash flag + form builder ─────────────────────────
alter table public.services add column if not exists is_flash    boolean not null default false;
alter table public.services add column if not exists form_fields jsonb   not null default '[]'::jsonb;

alter table public.services drop constraint if exists services_fields_is_array;
alter table public.services add constraint services_fields_is_array check (jsonb_typeof(form_fields) = 'array');

-- Seed a proper form for each built-in service (only when its form is still empty,
-- so re-running this file never overwrites what an admin edited).
update public.services set form_fields = '[{"key": "type_of_work", "label": "Type of work", "type": "select", "required": true, "options": ["Fan / light fitting", "Switch or socket repair", "Wiring / rewiring", "MCB / fuse keeps tripping", "Inverter / UPS", "Appliance point installation", "Other"]}, {"key": "is_the_power_off_right_now", "label": "Is the power off right now?", "type": "yesno", "required": true}, {"key": "number_of_points_items", "label": "Number of points / items", "type": "number", "required": false, "placeholder": "e.g. 3 fans"}, {"key": "property_type", "label": "Property type", "type": "select", "required": true, "options": ["Flat / apartment", "Independent house", "Shop / office", "Other"]}, {"key": "brand_model_if_any", "label": "Brand / model (if any)", "type": "text", "required": false, "placeholder": "e.g. Havells ceiling fan"}, {"key": "description", "label": "Describe the problem", "type": "textarea", "required": true, "placeholder": "What happened? Any sparks, smell or noise?"}]'::jsonb where name = 'Electrician' and form_fields = '[]'::jsonb;
update public.services set form_fields = '[{"key": "type_of_issue", "label": "Type of issue", "type": "select", "required": true, "options": ["Leaking tap or pipe", "Blocked drain / toilet", "Water tank / motor", "Geyser", "New fitting installation", "Bathroom / kitchen work", "Other"]}, {"key": "where_is_the_problem", "label": "Where is the problem?", "type": "select", "required": true, "options": ["Bathroom", "Kitchen", "Terrace / overhead tank", "Outside / garden", "Other"]}, {"key": "is_water_leaking_right_now", "label": "Is water leaking right now?", "type": "yesno", "required": true}, {"key": "property_type", "label": "Property type", "type": "select", "required": true, "options": ["Flat / apartment", "Independent house", "Shop / office", "Other"]}, {"key": "description", "label": "Describe the problem", "type": "textarea", "required": true, "placeholder": "How long has it been happening?"}]'::jsonb where name = 'Plumbing' and form_fields = '[]'::jsonb;
update public.services set form_fields = '[{"key": "type_of_work", "label": "Type of work", "type": "select", "required": true, "options": ["Furniture repair", "New / custom furniture", "Door or window", "Wardrobe / modular kitchen", "Polish / paint", "Furniture assembly", "Other"]}, {"key": "item_s_and_size", "label": "Item(s) and size", "type": "text", "required": true, "placeholder": "e.g. 6ft wardrobe, 2 doors"}, {"key": "who_provides_the_material", "label": "Who provides the material?", "type": "select", "required": true, "options": ["I will provide", "Carpenter should bring", "Not sure yet"]}, {"key": "preferred_start_date", "label": "Preferred start date", "type": "date", "required": false}, {"key": "description", "label": "Describe the work", "type": "textarea", "required": true, "placeholder": "Finish, colour, measurements, references…"}]'::jsonb where name = 'Carpentry' and form_fields = '[]'::jsonb;
update public.services set form_fields = '[{"key": "vehicle_type", "label": "Vehicle type", "type": "select", "required": true, "options": ["Bike", "Scooter", "Car", "Auto / e-rickshaw", "Truck / commercial"]}, {"key": "make_and_model", "label": "Make and model", "type": "text", "required": true, "placeholder": "e.g. Honda Activa 6G"}, {"key": "registration_number", "label": "Registration number", "type": "text", "required": false, "placeholder": "e.g. RJ27 AB 1234"}, {"key": "fuel_type", "label": "Fuel type", "type": "select", "required": true, "options": ["Petrol", "Diesel", "CNG", "Electric"]}, {"key": "what_is_wrong", "label": "What is wrong?", "type": "multiselect", "required": true, "options": ["Won''t start", "Puncture / tyre", "Battery", "Brakes", "Engine noise / smoke", "Overheating", "Regular service", "Other"]}, {"key": "where_is_the_vehicle", "label": "Where is the vehicle?", "type": "select", "required": true, "options": ["At my home / parking", "On the road", "At a workshop"]}, {"key": "description", "label": "Describe the problem", "type": "textarea", "required": false, "placeholder": "Anything else the mechanic should know"}]'::jsonb where name = 'Mechanic' and form_fields = '[]'::jsonb;
update public.services set form_fields = '[{"key": "vehicle_type", "label": "Vehicle type", "type": "select", "required": true, "options": ["Hatchback", "Sedan", "SUV / MUV", "Bike / scooter"]}, {"key": "make_and_model", "label": "Make and model", "type": "text", "required": true, "placeholder": "e.g. Maruti Swift"}, {"key": "wash_package", "label": "Wash package", "type": "select", "required": true, "options": ["Exterior wash", "Exterior + interior cleaning", "Full detailing", "Polish / wax"]}, {"key": "number_of_vehicles", "label": "Number of vehicles", "type": "number", "required": true, "placeholder": "1"}, {"key": "water_and_power_available_at_the_spot", "label": "Water and power available at the spot?", "type": "yesno", "required": true}, {"key": "parking_type", "label": "Parking type", "type": "select", "required": false, "options": ["Basement", "Open parking", "Road side"]}, {"key": "description", "label": "Anything we should know?", "type": "textarea", "required": false, "placeholder": "Stains, scratches, special requests"}]'::jsonb where name = 'Car wash' and form_fields = '[]'::jsonb;
update public.services set form_fields = '[{"key": "event_type", "label": "Event type", "type": "select", "required": true, "options": ["Birthday", "Wedding / engagement", "Corporate event", "Puja / festival", "House party / kitty", "Other"]}, {"key": "event_date", "label": "Event date", "type": "date", "required": true}, {"key": "number_of_guests", "label": "Number of guests", "type": "number", "required": true, "placeholder": "e.g. 60"}, {"key": "meals_needed", "label": "Meals needed", "type": "multiselect", "required": true, "options": ["Breakfast", "Lunch", "Dinner", "Snacks / starters", "Desserts"]}, {"key": "food_preference", "label": "Food preference", "type": "select", "required": true, "options": ["Pure veg", "Veg + non-veg", "Jain", "Mixed – tell us below"]}, {"key": "service_style", "label": "Service style", "type": "select", "required": false, "options": ["Buffet", "Served at table", "Packed boxes"]}, {"key": "budget_per_plate", "label": "Budget per plate (₹)", "type": "number", "required": false, "placeholder": "Optional"}, {"key": "description", "label": "Menu ideas / notes", "type": "textarea", "required": false, "placeholder": "Dishes you love, allergies…"}]'::jsonb where name = 'Catering' and form_fields = '[]'::jsonb;

-- ───────────────────────── 3. bookings ─────────────────────────
alter table public.bookings add column if not exists details      jsonb   not null default '[]'::jsonb;
alter table public.bookings add column if not exists is_flash     boolean not null default false;
alter table public.bookings add column if not exists alt_phone    text;
alter table public.bookings add column if not exists maps_link    text;
alter table public.bookings add column if not exists contact_name text;

alter table public.bookings drop constraint if exists bookings_maps_link_ok;
alter table public.bookings add constraint bookings_maps_link_ok
  check (maps_link is null or (maps_link ~* '^https?://' and char_length(maps_link) <= 500));
alter table public.bookings drop constraint if exists bookings_alt_phone_ok;
alter table public.bookings add constraint bookings_alt_phone_ok
  check (alt_phone is null or alt_phone ~ '^[0-9]{10}$');

create index if not exists bookings_flash_idx on public.bookings (is_flash) where is_flash;

-- On every new booking the SERVER decides: the flash flag (from the service), the visit-fee split,
-- and whether every required question of that service's form was answered.
create or replace function public.bookings_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee    integer;
  v_flash  boolean;
  v_fields jsonb;
  v_f      jsonb;
  v_val    jsonb;
begin
  if tg_op = 'INSERT' then
    select coalesce(nullif(full_name, ''), email, '') into new.customer_name
    from public.profiles where id = new.user_id;
    new.customer_name := coalesce(new.customer_name, '');

    select visit_fee into v_fee from public.platform_settings where id = 1;
    new.visit_fee := coalesce(v_fee, 149);
    new.visit_provider_share := ceil(new.visit_fee / 2.0)::integer;
    new.visit_platform_share := new.visit_fee - new.visit_provider_share;

    select is_flash, form_fields into v_flash, v_fields from public.services where name = new.service;
    new.is_flash := coalesce(v_flash, false);

    if jsonb_typeof(new.details) is distinct from 'array' then new.details := '[]'::jsonb; end if;
    if char_length(new.details::text) > 12000 then raise exception 'The form answers are too long'; end if;

    if v_fields is not null and jsonb_typeof(v_fields) = 'array' then
      for v_f in select * from jsonb_array_elements(v_fields) loop
        if coalesce((v_f ->> 'required')::boolean, false) then
          select e -> 'value' into v_val from jsonb_array_elements(new.details) e where e ->> 'key' = v_f ->> 'key' limit 1;
          if v_val is null or v_val = 'null'::jsonb
             or (jsonb_typeof(v_val) = 'string' and trim(v_val #>> '{}') = '')
             or (jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) = 0) then
            raise exception 'Please fill in: %', v_f ->> 'label';
          end if;
        end if;
      end loop;
    end if;
  end if;

  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bookings_before_write on public.bookings;
create trigger bookings_before_write
  before insert or update on public.bookings
  for each row execute function public.bookings_before_write();

-- ───────────────────────── 4. flash (emergency) services ─────────────────────────
insert into public.services (name, detail, icon, is_flash, form_fields) values
  ('Emergency electrician', 'Sparks, burning smell, no power', 'siren', true, '[{"key": "what_is_happening", "label": "What is happening?", "type": "select", "required": true, "options": ["Sparking / short circuit", "Burning smell", "Whole-house power cut", "Electric shock risk / live wire", "Tripping again and again", "Other"]}, {"key": "is_anyone_in_danger_right_now", "label": "Is anyone in danger right now?", "type": "yesno", "required": true}, {"key": "have_you_switched_off_the_main_supply", "label": "Have you switched off the main supply?", "type": "yesno", "required": true}, {"key": "property_type", "label": "Property type", "type": "select", "required": true, "options": ["Flat / apartment", "Independent house", "Shop / office", "Other"]}, {"key": "description", "label": "Describe quickly", "type": "textarea", "required": true, "placeholder": "One or two lines is enough"}]'::jsonb),
  ('Emergency plumber', 'Burst pipe, flooding, blocked toilet', 'flame', true, '[{"key": "what_is_happening", "label": "What is happening?", "type": "select", "required": true, "options": ["Burst pipe / major leak", "Water flooding the floor", "Blocked toilet overflowing", "No water at all", "Geyser leak", "Other"]}, {"key": "can_you_close_the_main_valve", "label": "Can you close the main valve?", "type": "select", "required": true, "options": ["Yes, already closed", "Don''t know where it is", "Valve is not working"]}, {"key": "property_type", "label": "Property type", "type": "select", "required": true, "options": ["Flat / apartment", "Independent house", "Shop / office", "Other"]}, {"key": "description", "label": "Describe quickly", "type": "textarea", "required": true, "placeholder": "One or two lines is enough"}]'::jsonb),
  ('Vehicle breakdown SOS', 'Stuck on the road? We come to you', 'truck', true, '[{"key": "vehicle_type", "label": "Vehicle type", "type": "select", "required": true, "options": ["Bike / scooter", "Car", "Auto / e-rickshaw", "Truck / commercial"]}, {"key": "make_and_model", "label": "Make and model", "type": "text", "required": true, "placeholder": "e.g. Hyundai i20"}, {"key": "where_are_you_stuck", "label": "Where are you stuck?", "type": "text", "required": true, "placeholder": "Road, landmark, nearest town"}, {"key": "what_happened", "label": "What happened?", "type": "select", "required": true, "options": ["Won''t start", "Puncture", "Accident / damage", "Engine overheating", "Out of fuel", "Battery dead", "Other"]}, {"key": "is_it_safe_where_you_are", "label": "Is it safe where you are?", "type": "yesno", "required": true}, {"key": "description", "label": "Describe quickly", "type": "textarea", "required": false, "placeholder": "Anything else we should know"}]'::jsonb),
  ('Lockout help', 'Locked out of home, car or shop', 'key', true, '[{"key": "what_are_you_locked_out_of", "label": "What are you locked out of?", "type": "select", "required": true, "options": ["Home / flat", "Car", "Shop / office", "Cupboard / safe", "Other"]}, {"key": "type_of_lock", "label": "Type of lock", "type": "select", "required": false, "options": ["Normal key lock", "Digital / smart lock", "Padlock", "Not sure"]}, {"key": "is_anyone_stuck_inside", "label": "Is anyone stuck inside?", "type": "yesno", "required": true}, {"key": "description", "label": "Describe quickly", "type": "textarea", "required": false, "placeholder": "Anything else we should know"}]'::jsonb)
on conflict (name) do nothing;
