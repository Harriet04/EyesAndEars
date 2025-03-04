const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

// Helper function to send OTP
const sendOtp = async (email, mobile_number, otp) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'your_email@gmail.com',
            pass: 'your_email_password',
        },
    });

    const message = {
        from: 'your_email@gmail.com',
        to: email,
        subject: 'Your OTP Code',
        text: `Your OTP code is ${otp}`,
    };

    try {
        await transporter.sendMail(message);
        console.log('OTP sent');
    } catch (error) {
        console.error('Error sending OTP:', error);
    }
};

// Signup endpoint
app.post('/api/signup', async (req, res) => {
    const { name, email, mobile_number, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
        await pool.query(
            'INSERT INTO users (name, email, mobile_number, hashed_password, otp, otp_expiry) VALUES ($1, $2, $3, $4, $5, $6)',
            [name, email, mobile_number, hashedPassword, otp, otpExpiry]
        );

        await sendOtp(email, mobile_number, otp);
        res.status(201).send({ message: 'Signup successful. OTP sent.' });
    } catch (error) {
        res.status(500).send({ error: 'Error during signup' });
    }
});

// Validate OTP endpoint
app.post('/api/validate-otp', async (req, res) => {
    const { email, mobile_number, otp } = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE (email = $1 OR mobile_number = $2) AND otp = $3 AND otp_expiry > NOW()',
            [email, mobile_number, otp]
        );

        if (result.rowCount === 0) {
            return res.status(400).send({ error: 'Invalid or expired OTP' });
        }

        await pool.query(
            'UPDATE users SET otp = NULL, otp_expiry = NULL WHERE email = $1 OR mobile_number = $2',
            [email, mobile_number]
        );

        res.send({ message: 'OTP validated successfully' });
    } catch (error) {
        res.status(500).send({ error: 'Error during OTP validation' });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { email_or_mobile, password } = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR mobile_number = $2',
            [email_or_mobile, email_or_mobile]
        );

        if (result.rowCount === 0) {
            return res.status(401).send({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.hashed_password);

        if (!isMatch) {
            return res.status(401).send({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.send({ token });
    } catch (error) {
        res.status(500).send({ error: 'Error during login' });
    }
});

app.get('/', (req, res) => {
    res.send('Backend is running in VS Code! Hi there!');
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));