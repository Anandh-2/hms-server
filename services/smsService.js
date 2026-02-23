const cron = require('node-cron');
const db = require('../config/database');
const twilio = require('twilio');

let cronJob = null;

const initializeSMSService = () => {
  // Twilio client
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const sendSMS = async (phoneNumber, message) => {
    try {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        console.log('Twilio not configured. SMS would be sent to:', phoneNumber);
        console.log('Message:', message);
        return { status: 'sent', message: 'SMS not configured (demo mode)' };
      }

      const result = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });

      return { status: 'sent', sid: result.sid };
    } catch (error) {
      console.error('SMS sending error:', error);
      return { status: 'failed', error: error.message };
    }
  };

  const sendAttendanceReminders = async () => {
    try {
      console.log('Checking for attendance reminders...');

      // Get reminder settings
      const [settings] = await db.query(
        'SELECT * FROM reminder_settings WHERE is_active = true LIMIT 1'
      );

      if (settings.length === 0) {
        console.log('No active reminder settings found');
        return;
      }

      // Get all students with phone numbers
      const [students] = await db.query(`
        SELECT s.id, s.first_name, s.last_name, s.phone_number
        FROM students s
        WHERE s.phone_number IS NOT NULL AND s.phone_number != ''
      `);

      console.log(`Sending reminders to ${students.length} students`);

      for (const student of students) {
        const message = `Hello ${student.first_name}, this is a reminder to mark your attendance at the hostel. Thank you!`;
        
        const result = await sendSMS(student.phone_number, message);

        // Log SMS
        await db.query(
          'INSERT INTO sms_logs (student_id, phone_number, message, status) VALUES (?, ?, ?, ?)',
          [student.id, student.phone_number, message, result.status]
        );
      }

      console.log('Attendance reminders sent successfully');
    } catch (error) {
      console.error('Error sending attendance reminders:', error);
    }
  };

  const updateCronSchedule = async () => {
    try {
      const [settings] = await db.query(
        'SELECT * FROM reminder_settings WHERE is_active = true LIMIT 1'
      );

      if (settings.length === 0) {
        if (cronJob) {
          cronJob.stop();
          cronJob = null;
        }
        return;
      }

      const reminderTime = settings[0].reminder_time;
      const [hours, minutes] = reminderTime.split(':');

      // Stop existing cron job if any
      if (cronJob) {
        cronJob.stop();
      }

      // Create new cron job
      // Format: minute hour * * *
      const cronExpression = `${minutes} ${hours} * * *`;
      console.log(`Setting up reminder cron job: ${cronExpression}`);

      cronJob = cron.schedule(cronExpression, sendAttendanceReminders);

      console.log('SMS reminder service initialized');
    } catch (error) {
      console.error('Error updating cron schedule:', error);
    }
  };

  // Initialize on startup
  updateCronSchedule();

  return {
    sendSMS,
    sendAttendanceReminders,
    updateCronSchedule
  };
};

module.exports = initializeSMSService;
