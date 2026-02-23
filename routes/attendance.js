const express = require('express');
const db = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// Log attendance via RFID (can be called by RFID system)
router.post('/rfid-log', async (req, res) => {
  try {
    const { rfid_tag, log_type } = req.body;

    if (!rfid_tag || !log_type) {
      return res.status(400).json({ message: 'RFID tag and log type are required' });
    }

    if (!['entry', 'exit'].includes(log_type)) {
      return res.status(400).json({ message: 'Invalid log type' });
    }

    // Find student by RFID tag
    const [students] = await db.query('SELECT id FROM students WHERE rfid_tag = ?', [rfid_tag]);

    if (students.length === 0) {
      return res.status(404).json({ message: 'Student not found with this RFID tag' });
    }

    const studentId = students[0].id;

    // Insert attendance log
    await db.query(
      'INSERT INTO attendance_logs (student_id, log_type, rfid_tag) VALUES (?, ?, ?)',
      [studentId, log_type, rfid_tag]
    );

    res.status(201).json({ 
      message: 'Attendance logged successfully',
      student_id: studentId,
      log_type
    });
  } catch (error) {
    console.error('RFID log error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all attendance logs (admin and warden only)
router.get('/', authMiddleware, roleMiddleware('admin', 'warden'), async (req, res) => {
  try {
    const { student_id, from_date, to_date, limit = 100 } = req.query;

    let query = `
      SELECT 
        al.*,
        s.student_id as student_number,
        s.first_name,
        s.last_name,
        s.room_number
      FROM attendance_logs al
      JOIN students s ON al.student_id = s.id
      WHERE 1=1
    `;
    
    const params = [];

    if (student_id) {
      query += ' AND al.student_id = ?';
      params.push(student_id);
    }

    if (from_date) {
      query += ' AND DATE(al.timestamp) >= ?';
      params.push(from_date);
    }

    if (to_date) {
      query += ' AND DATE(al.timestamp) <= ?';
      params.push(to_date);
    }

    query += ' ORDER BY al.timestamp DESC LIMIT ?';
    params.push(parseInt(limit));

    const [logs] = await db.query(query, params);
    res.json(logs);
  } catch (error) {
    console.error('Get attendance logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get student's own attendance logs
router.get('/my-logs', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const { from_date, to_date, limit = 100 } = req.query;

    // Get student ID
    const [students] = await db.query('SELECT id FROM students WHERE user_id = ?', [req.user.id]);

    if (students.length === 0) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const studentId = students[0].id;

    let query = `
      SELECT * FROM attendance_logs
      WHERE student_id = ?
    `;
    
    const params = [studentId];

    if (from_date) {
      query += ' AND DATE(timestamp) >= ?';
      params.push(from_date);
    }

    if (to_date) {
      query += ' AND DATE(timestamp) <= ?';
      params.push(to_date);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(parseInt(limit));

    const [logs] = await db.query(query, params);
    res.json(logs);
  } catch (error) {
    console.error('Get my logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current status of all students (admin and warden only)
router.get('/current-status', authMiddleware, roleMiddleware('admin', 'warden'), async (req, res) => {
  try {
    const [students] = await db.query(`
      SELECT 
        s.id,
        s.student_id,
        s.first_name,
        s.last_name,
        s.room_number,
        (SELECT log_type FROM attendance_logs WHERE student_id = s.id ORDER BY timestamp DESC LIMIT 1) as current_status,
        (SELECT timestamp FROM attendance_logs WHERE student_id = s.id ORDER BY timestamp DESC LIMIT 1) as last_updated,
        cls.status as college_leave_status,
        cls.reason as college_leave_reason
      FROM students s
      LEFT JOIN college_leave_status cls ON s.id = cls.student_id AND cls.date = CURDATE()
      ORDER BY s.student_id
    `);

    const studentsWithStatus = students.map(student => ({
      ...student,
      is_present: student.current_status === 'entry' || student.college_leave_status === 'inside_hostel',
      display_status: student.college_leave_status === 'inside_hostel' 
        ? 'Inside Hostel (College Leave)' 
        : student.current_status === 'entry' 
          ? 'Present' 
          : 'Outside'
    }));

    res.json(studentsWithStatus);
  } catch (error) {
    console.error('Get current status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get student's own current status
router.get('/my-status', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const [students] = await db.query('SELECT id FROM students WHERE user_id = ?', [req.user.id]);

    if (students.length === 0) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const studentId = students[0].id;

    const [logs] = await db.query(
      'SELECT log_type, timestamp FROM attendance_logs WHERE student_id = ? ORDER BY timestamp DESC LIMIT 1',
      [studentId]
    );

    const [leaveStatus] = await db.query(
      'SELECT status, reason FROM college_leave_status WHERE student_id = ? AND date = CURDATE()',
      [studentId]
    );

    const status = {
      current_status: logs.length > 0 ? logs[0].log_type : null,
      last_updated: logs.length > 0 ? logs[0].timestamp : null,
      is_present: logs.length > 0 && logs[0].log_type === 'entry',
      college_leave: leaveStatus.length > 0 ? leaveStatus[0] : null
    };

    res.json(status);
  } catch (error) {
    console.error('Get my status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
