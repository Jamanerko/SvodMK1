-- Rename "Муфта подземная соединительная" to include the mark/type in the name
-- so they are distinguishable in lists and dropdowns
UPDATE materials SET name = 'Муфта подземная соединительная СЦБС-RWD-3 (3-7x0,9)' WHERE name = 'Муфта подземная соединительная' AND article = 'СЦБС-RWD-3-7x0,9';
UPDATE materials SET name = 'Муфта подземная соединительная СЦБС-RWD-9 (9-19x0,9)' WHERE name = 'Муфта подземная соединительная' AND article = 'СЦБС-RWD-9-19x0,9';
UPDATE materials SET name = 'Муфта подземная соединительная СЦБС-RWD-21 (21-24x0,9)' WHERE name = 'Муфта подземная соединительная' AND article = 'СЦБС-RWD-21-24x0,9';
UPDATE materials SET name = 'Муфта подземная соединительная СЦБС-RWD-27 (27-42x0,9)' WHERE name = 'Муфта подземная соединительная' AND article = 'СЦБС-RWD-27-42x0,9';
UPDATE materials SET name = 'Муфта подземная соединительная СЦБС-RWD-48 (48-61x0,9)' WHERE name = 'Муфта подземная соединительная' AND article = 'СЦБС-RWD-48-61x0,9';

-- Also rename the optical mufta for clarity
UPDATE materials SET name = 'Муфта оптическая соединительная на 32 волокна' WHERE name = 'Муфта оптическая соединительная на 32 волокна';
