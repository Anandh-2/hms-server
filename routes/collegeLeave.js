const express = require('express');
const db = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

const isValidISODate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const isWorkingDay = (dateString) => {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  return day >= 1 && day <= 5;
};

// Mark college leave status (student only)
router.post('/', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const { date, reason } = req.body;

    if (!date || !reason) {
      return res.status(400).json({ message: 'Date and reason are required' });
    }

    if (!isValidISODate(date)) {
      return res.status(400).json({ message: 'Date must be in YYYY-MM-DD format' });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (date !== today) {
      return res.status(400).json({ message: 'College leave can only be marked for today' });
    }

    if (!isWorkingDay(date)) {
      return res.status(400).json({ message: 'College leave is only applicable on working days (Mon-Fri)' });
    }

    if (reason.trim().length < 3) {
      return res.status(400).json({ message: 'Reason must be at least 3 characters' });
    }

    // Get student ID
    const [students] = await db.query('SELECT id FROM students WHERE user_id = ?', [req.user.id]);

    if (students.length === 0) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const studentId = students[0].id;

    // Insert or update college leave status
    await db.query(
      `INSERT INTO college_leave_status (student_id, date, reason, status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE reason = ?, status = ?`,
      [studentId, date, reason.trim(), 'inside_hostel', reason.trim(), 'inside_hostel']
    );

    res.status(201).json({ message: 'College leave marked successfully (Inside Hostel)' });
  } catch (error) {
    console.error('College leave error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all college leave records (admin and warden only)
router.get('/', authMiddleware, roleMiddleware('admin', 'warden'), async (req, res) => {
  try {
    const { date, student_id } = req.query;

    let query = `
      SELECT 
        cls.*,
        s.student_id as student_number,
        s.first_name,
        s.last_name,
        s.room_number
      FROM college_leave_status cls
      JOIN students s ON cls.student_id = s.id
      WHERE 1=1
    `;
    
    const params = [];

    if (date) {
      query += ' AND cls.date = ?';
      params.push(date);
    } else {
      query += ' AND cls.date = CURDATE()';
    }

    if (student_id) {
      query += ' AND cls.student_id = ?';
      params.push(student_id);
    }

    query += ' ORDER BY cls.date DESC, s.student_id';

    const [records] = await db.query(query, params);
    res.json(records);
  } catch (error) {
    console.error('Get college leave records error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get student's own college leave records
router.get('/my-records', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const [students] = await db.query('SELECT id FROM students WHERE user_id = ?', [req.user.id]);

    if (students.length === 0) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const studentId = students[0].id;

    const [records] = await db.query(
      'SELECT * FROM college_leave_status WHERE student_id = ? ORDER BY date DESC LIMIT 30',
      [studentId]
    );

    res.json(records);
  } catch (error) {
    console.error('Get my college leave records error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete college leave record (student only - for today)
router.delete('/:id', authMiddleware, roleMiddleware('student'), async (req, res) => {
  try {
    const recordId = req.params.id;

    const [students] = await db.query('SELECT id FROM students WHERE user_id = ?', [req.user.id]);

    if (students.length === 0) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const studentId = students[0].id;

    await db.query(
      'DELETE FROM college_leave_status WHERE id = ? AND student_id = ? AND date = CURDATE()',
      [recordId, studentId]
    );

    res.json({ message: 'College leave record deleted successfully' });
  } catch (error) {
    console.error('Delete college leave record error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
