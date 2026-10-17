-- Дата рождения при регистрации (для гороскопа и проверки возраста 18+). Хранится текстом ГГГГ-ММ-ДД.
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date TEXT CHECK (birth_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
