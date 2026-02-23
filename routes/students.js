const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// Create student account (by warden or admin)
router.post('/', authMiddleware, roleMiddleware('admin', 'warden'), async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      username, email, password, student_id, first_name, last_name,
      date_of_birth, phone_number, emergency_contact, parent_name,
      parent_phone, address, room_number, rfid_tag, blood_group, medical_conditions
    } = req.body;

    // Validate required fields
    if (!username || !email || !password || !student_id || !first_name || !last_name) {
      await connection.rollback();
      return res.status(400).json({ message: 'Required fields are missing' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const [userResult] = await connection.query(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, 'student']
    );

    const userId = userResult.insertId;

    // Create student
    await connection.query(
      `INSERT INTO students (
        user_id, student_id, first_name, last_name, date_of_birth,
        phone_number, emergency_contact, parent_name, parent_phone,
        address, room_number, rfid_tag, blood_group, medical_conditions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, student_id, first_name, last_name, date_of_birth,
        phone_number, emergency_contact, parent_name, parent_phone,
        address, room_number, rfid_tag, blood_group, medical_conditions
      ]
    );

    await connection.commit();
    res.status(201).json({ message: 'Student created successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Create student error:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Username, email, student ID, or RFID tag already exists' });
    }
    
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
});

// Get all students (admin and warden only)
router.get('/', authMiddleware, roleMiddleware('admin', 'warden'), async (req, res) => {
  try {
    const [students] = await db.query(`
      SELECT 
        s.*, 
        u.username, 
        u.email,
        (SELECT log_type FROM attendance_logs WHERE student_id = s.id ORDER BY timestamp DESC LIMIT 1) as last_log_type,
        (SELECT timestamp FROM attendance_logs WHERE student_id = s.id ORDER BY timestamp DESC LIMIT 1) as last_log_time
      FROM students s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.student_id
    `);

    res.json(students);
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current student's own data
router.get('/me/profile', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const [students] = await db.query(`
      SELECT 
        s.*, 
        u.username, 
        u.email
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE u.id = ?
    `, [req.user.id]);

    if (students.length === 0) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    res.json(students[0]);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get student by ID (own data or admin/warden)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const studentId = req.params.id;

    const [students] = await db.query(`
      SELECT 
        s.*, 
        u.username, 
        u.email,
        u.id as user_id
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `, [studentId]);

    if (students.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const student = students[0];

    // Check authorization
    if (req.user.role === 'student' && student.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(student);
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update student
router.put('/:id', authMiddleware, roleMiddleware('admin', 'warden'), async (req, res) => {
  try {
    const studentId = req.params.id;
    const {
      first_name, last_name, date_of_birth, phone_number,
      emergency_contact, parent_name, parent_phone, address,
      room_number, rfid_tag, blood_group, medical_conditions
    } = req.body;

    await db.query(`
      UPDATE students SET
        first_name = ?, last_name = ?, date_of_birth = ?,
        phone_number = ?, emergency_contact = ?, parent_name = ?,
        parent_phone = ?, address = ?, room_number = ?,
        rfid_tag = ?, blood_group = ?, medical_conditions = ?
      WHERE id = ?
    `, [
      first_name, last_name, date_of_birth, phone_number,
      emergency_contact, parent_name, parent_phone, address,
      room_number, rfid_tag, blood_group, medical_conditions, studentId
    ]);

    res.json({ message: 'Student updated successfully' });
  } catch (error) {
    console.error('Update student error:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'RFID tag already exists' });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete student
router.delete('/:id', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const studentId = req.params.id;

    // Get user_id
    const [students] = await connection.query('SELECT user_id FROM students WHERE id = ?', [studentId]);
    
    if (students.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Student not found' });
    }

    // Delete user (cascade will delete student)
    await connection.query('DELETE FROM users WHERE id = ?', [students[0].user_id]);

    await connection.commit();
    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Delete student error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
});

module.exports = router;
