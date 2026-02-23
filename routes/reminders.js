const express = require('express');
const db = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get reminder settings (admin and warden only)
router.get('/', authMiddleware, roleMiddleware('admin', 'warden'), async (req, res) => {
  try {
    const [settings] = await db.query('SELECT * FROM reminder_settings LIMIT 1');
    
    if (settings.length === 0) {
      return res.json({ 
        reminder_time: '20:00:00',
        is_active: false 
      });
    }

    res.json(settings[0]);
  } catch (error) {
    console.error('Get reminder settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update reminder settings (admin and warden only)
router.put('/', authMiddleware, roleMiddleware('admin', 'warden'), async (req, res) => {
  try {
    const { reminder_time, is_active } = req.body;

    if (!reminder_time) {
      return res.status(400).json({ message: 'Reminder time is required' });
    }

    // Check if settings exist
    const [existing] = await db.query('SELECT id FROM reminder_settings LIMIT 1');

    if (existing.length === 0) {
      // Insert new settings
      await db.query(
        'INSERT INTO reminder_settings (reminder_time, is_active, created_by) VALUES (?, ?, ?)',
        [reminder_time, is_active !== undefined ? is_active : true, req.user.id]
      );
    } else {
      // Update existing settings
      await db.query(
        'UPDATE reminder_settings SET reminder_time = ?, is_active = ? WHERE id = ?',
        [reminder_time, is_active !== undefined ? is_active : true, existing[0].id]
      );
    }

    // Update cron schedule
    const smsService = req.app.get('smsService');
    if (smsService && smsService.updateCronSchedule) {
      await smsService.updateCronSchedule();
    }

    res.json({ message: 'Reminder settings updated successfully' });
  } catch (error) {
    console.error('Update reminder settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send test reminder (admin and warden only)
router.post('/test', authMiddleware, roleMiddleware('admin', 'warden'), async (req, res) => {
  try {
    const smsService = req.app.get('smsService');
    
    if (!smsService) {
      return res.status(500).json({ message: 'SMS service not initialized' });
    }

    await smsService.sendAttendanceReminders();
    res.json({ message: 'Test reminders sent successfully' });
  } catch (error) {
    console.error('Send test reminder error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get SMS logs (admin and warden only)
router.get('/logs', authMiddleware, roleMiddleware('admin', 'warden'), async (req, res) => {
  try {
    const { student_id, limit = 50 } = req.query;

    let query = `
      SELECT 
        sl.*,
        s.student_id as student_number,
        s.first_name,
        s.last_name
      FROM sms_logs sl
      JOIN students s ON sl.student_id = s.id
      WHERE 1=1
    `;
    
    const params = [];

    if (student_id) {
      query += ' AND sl.student_id = ?';
      params.push(student_id);
    }

    query += ' ORDER BY sl.sent_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const [logs] = await db.query(query, params);
    res.json(logs);
  } catch (error) {
    console.error('Get SMS logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
