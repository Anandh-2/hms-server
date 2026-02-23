require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const nowDate = new Date().toISOString().slice(0, 10);

const ensureUser = async ({ username, email, password, role }) => {
  const hashedPassword = await bcrypt.hash(password, 10);

  const [existing] = await db.query(
    'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
    [username, email]
  );

  if (existing.length > 0) {
    const userId = existing[0].id;
    await db.query(
      'UPDATE users SET username = ?, email = ?, password = ?, role = ? WHERE id = ?',
      [username, email, hashedPassword, role, userId]
    );
    return userId;
  }

  const [result] = await db.query(
    'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
    [username, email, hashedPassword, role]
  );

  return result.insertId;
};

const ensureWardenProfile = async (userId, profile) => {
  const [existing] = await db.query('SELECT id FROM wardens WHERE user_id = ? LIMIT 1', [userId]);

  if (existing.length > 0) {
    await db.query(
      'UPDATE wardens SET first_name = ?, last_name = ?, phone_number = ? WHERE user_id = ?',
      [profile.first_name, profile.last_name, profile.phone_number, userId]
    );
    return;
  }

  await db.query(
    'INSERT INTO wardens (user_id, first_name, last_name, phone_number) VALUES (?, ?, ?, ?)',
    [userId, profile.first_name, profile.last_name, profile.phone_number]
  );
};

const ensureStudentProfile = async (userId, profile) => {
  const [existing] = await db.query('SELECT id FROM students WHERE user_id = ? LIMIT 1', [userId]);

  if (existing.length > 0) {
    await db.query(
      `UPDATE students
       SET student_id = ?, first_name = ?, last_name = ?, date_of_birth = ?, phone_number = ?,
           emergency_contact = ?, parent_name = ?, parent_phone = ?, address = ?, room_number = ?,
           rfid_tag = ?, blood_group = ?, medical_conditions = ?
       WHERE user_id = ?`,
      [
        profile.student_id,
        profile.first_name,
        profile.last_name,
        profile.date_of_birth,
        profile.phone_number,
        profile.emergency_contact,
        profile.parent_name,
        profile.parent_phone,
        profile.address,
        profile.room_number,
        profile.rfid_tag,
        profile.blood_group,
        profile.medical_conditions,
        userId,
      ]
    );
    return existing[0].id;
  }

  const [result] = await db.query(
    `INSERT INTO students (
      user_id, student_id, first_name, last_name, date_of_birth,
      phone_number, emergency_contact, parent_name, parent_phone,
      address, room_number, rfid_tag, blood_group, medical_conditions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      profile.student_id,
      profile.first_name,
      profile.last_name,
      profile.date_of_birth,
      profile.phone_number,
      profile.emergency_contact,
      profile.parent_name,
      profile.parent_phone,
      profile.address,
      profile.room_number,
      profile.rfid_tag,
      profile.blood_group,
      profile.medical_conditions,
    ]
  );

  return result.insertId;
};

const ensureReminderSettings = async (adminUserId) => {
  const [existing] = await db.query('SELECT id FROM reminder_settings LIMIT 1');

  if (existing.length > 0) {
    await db.query(
      'UPDATE reminder_settings SET reminder_time = ?, is_active = ? WHERE id = ?',
      ['20:00:00', true, existing[0].id]
    );
    return;
  }

  await db.query(
    'INSERT INTO reminder_settings (reminder_time, is_active, created_by) VALUES (?, ?, ?)',
    ['20:00:00', true, adminUserId]
  );
};

const ensureSampleAttendanceLogs = async (studentId, rfidTag) => {
  const [existing] = await db.query(
    'SELECT id FROM attendance_logs WHERE student_id = ? LIMIT 1',
    [studentId]
  );

  if (existing.length > 0) {
    return;
  }

  await db.query(
    'INSERT INTO attendance_logs (student_id, log_type, rfid_tag, timestamp) VALUES (?, ?, ?, NOW() - INTERVAL 2 HOUR)',
    [studentId, 'exit', rfidTag]
  );

  await db.query(
    'INSERT INTO attendance_logs (student_id, log_type, rfid_tag, timestamp) VALUES (?, ?, ?, NOW() - INTERVAL 1 HOUR)',
    [studentId, 'entry', rfidTag]
  );
};

const ensureSampleHolidayLeave = async (studentId) => {
  const [existing] = await db.query(
    'SELECT id FROM holiday_leave_applications WHERE student_id = ? AND status = ? LIMIT 1',
    [studentId, 'pending']
  );

  if (existing.length > 0) {
    return;
  }

  await db.query(
    `INSERT INTO holiday_leave_applications
      (student_id, from_date, to_date, reason, status)
     VALUES (?, DATE_ADD(CURDATE(), INTERVAL 5 DAY), DATE_ADD(CURDATE(), INTERVAL 7 DAY), ?, 'pending')`,
    [studentId, 'Family visit during weekend holiday']
  );
};

const ensureSampleCollegeLeave = async (studentId) => {
  const day = new Date().getDay();
  if (day === 0 || day === 6) {
    return;
  }

  const [existing] = await db.query(
    'SELECT id FROM college_leave_status WHERE student_id = ? AND date = ? LIMIT 1',
    [studentId, nowDate]
  );

  if (existing.length > 0) {
    return;
  }

  await db.query(
    'INSERT INTO college_leave_status (student_id, date, reason, status) VALUES (?, ?, ?, ?)',
    [studentId, nowDate, 'Medical appointment approved by warden', 'inside_hostel']
  );
};

const seed = async () => {
  try {
    console.log('Starting database seed...');

    const adminUserId = await ensureUser({
      username: 'admin',
      email: 'admin@hostel.com',
      password: 'admin123',
      role: 'admin',
    });

    const wardenUserId = await ensureUser({
      username: 'warden1',
      email: 'warden1@hostel.com',
      password: 'warden123',
      role: 'warden',
    });

    await ensureWardenProfile(wardenUserId, {
      first_name: 'Raj',
      last_name: 'Kumar',
      phone_number: '+919900000001',
    });

    const studentUserId = await ensureUser({
      username: 'student1',
      email: 'student1@hostel.com',
      password: 'student123',
      role: 'student',
    });

    const studentId = await ensureStudentProfile(studentUserId, {
      student_id: 'STU001',
      first_name: 'Anu',
      last_name: 'Sharma',
      date_of_birth: '2005-08-15',
      phone_number: '+919900000010',
      emergency_contact: '+919900000011',
      parent_name: 'Suresh Sharma',
      parent_phone: '+919900000012',
      address: 'Coimbatore, Tamil Nadu',
      room_number: 'A-101',
      rfid_tag: 'RFID-STU001',
      blood_group: 'O+',
      medical_conditions: 'N/A',
    });

    await ensureReminderSettings(adminUserId);
    await ensureSampleAttendanceLogs(studentId, 'RFID-STU001');
    await ensureSampleHolidayLeave(studentId);
    await ensureSampleCollegeLeave(studentId);

    console.log('Seed completed successfully.');
    console.log('Demo login credentials:');
    console.log('Admin   -> username: admin,    password: admin123');
    console.log('Warden  -> username: warden1,  password: warden123');
    console.log('Student -> username: student1, password: student123');
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
};

seed();
