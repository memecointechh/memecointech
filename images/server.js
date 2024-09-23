const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2'); 
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();


let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER, // Your Gmail address
    pass: process.env.GMAIL_PASS, // Your App Password
  },
});

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,  
    queueLimit: 0         
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname));

// Function to send email
const sendEmail = async (to, subject, htmlContent) => {
  try {
    await transporter.sendMail({
      from: `"MemecoinTech" <${process.env.GMAIL_USER}>`,
      to: to,
      subject: subject,
      html: htmlContent,
    });
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
  }
};



app.post('/api/auth/register', (req, res) => {
  const { full_name, email, username, password, secret_question, secret_answer, bitcoin_address, referral_code } = req.body;

  // Validate input
  if (!full_name || !email || !username || !password || !secret_question || !secret_answer) {
    return res.status(400).json({ message: 'Please fill in all required fields.' });
  }

  // Check if referral code exists
  let referrerId = null;
  if (referral_code) {
    pool.query('SELECT id FROM users WHERE referral_code = ?', [referral_code], (error, results) => {
      if (error) {
        console.error('Error checking referral code:', error);
        return res.status(500).json({ message: 'Error registering user.' });
      }

      if (results.length > 0) {
        referrerId = results[0].id;
      }

      // Insert user into database
      pool.query(
        'INSERT INTO users (full_name, email, username, password, secret_question, secret_answer, bitcoin_address, referral_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [full_name, email, username, password, secret_question, secret_answer, bitcoin_address, referral_code],
        (error, results) => {
          if (error) {
            console.error('Error inserting user into the database:', error);
            return res.status(500).json({ message: 'Error registering user.' });
          }

          // Redirect to login page
          res.redirect('/signin.html');
        }
      );
    });
  } else {
    // Insert user into database without referral
    pool.query(
      'INSERT INTO users (full_name, email, username, password, secret_question, secret_answer, bitcoin_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [full_name, email, username, password, secret_question, secret_answer, bitcoin_address],
      (error, results) => {
        if (error) {
          console.error('Error inserting user into the database:', error);
          return res.status(500).json({ message: 'Error registering user.' });
        }

         // Send welcome email
         sendEmail(
          email,
          'Welcome to MemecoinTech',
          `
          <div style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4;">
      <table width="100%" style="max-width: 600px; margin: auto; border-collapse: collapse;">
        <tr>
          <td style="text-align: center; padding: 20px;">
            <img src="https://github.com/memecointechh/memecointech/blob/main/images/memecoin%20logo.png?raw=true" alt="Company Logo" style="max-width: 100%; height: auto;"/>
          </td>
        </tr>
        <tr>
          <td style="background-color: #3e059b; padding: 20px; text-align: center; color: white;">
            <h1 style="margin: 0;">Welcome, ${username}!</h1>
          </td>
        </tr>
        <tr>
          <td style="background-color: white; padding: 20px;">
            <p style="font-size: 16px; line-height: 1.5;">Your account has been successfully created. We're excited to have you on board!</p>
            <p style="font-size: 16px; line-height: 1.5;">We offer the following investment plans:</p>
            <ul style="list-style-type: none; padding: 0;">
              <li style="margin: 10px 0;">
                <a href="https://memecointech-fvh8.onrender.com/signin.html" style="display: inline-block; background-color: #3e059b; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Buy Plan 1</a>
              </li>
              <li style="margin: 10px 0;">
                <a href="https://memecointech-fvh8.onrender.com/signin.html" style="display: inline-block; background-color: #3e059b; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Buy Plan 2</a>
              </li>
              <li style="margin: 10px 0;">
                <a href="https://memecointech-fvh8.onrender.com/signin.html" style="display: inline-block; background-color: #3e059b; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Buy Plan 3</a>
              </li>
            </ul>
            <p style="font-size: 16px; line-height: 1.5;">Click on any of the above plans to log in and start investing!</p>
          </td>
        </tr>
        <tr>
          <td style="background-color: #f4f4f4; padding: 10px; text-align: center;">
            <p style="font-size: 12px; color: #666;">&copy; 2023 Your Investment Platform. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </div>
          
          `
        );

        // Redirect to login page
        res.redirect('/signin.html');
      }
    );
  }
});



// Route for user login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }

    // Check if the user is an admin
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        return res.redirect('/admindash.html');
    }

    // Query to check if the user is a regular user
    const query = 'SELECT * FROM users WHERE email = ? AND password = ?';
    pool.query(query, [email, password], (error, results) => {
        if (error) {
            console.error('Error querying the database:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (results.length > 0) {
            // User authenticated successfully
            const user = results[0]; // Assuming the first result is the user
            res.json({
                message: 'Login successful',
                username: user.username // Send username in response
            });
        } else {
            // Authentication failed
            res.status(401).json({ error: 'Invalid email or password' });
        }
    });
});



  app.get('/users', (req, res) => {
    const username = req.query.username;
    const db = mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
  
    db.connect((err) => {
      if (err) {
        console.error(err);
        res.status(500).json({ message: 'Error connecting to database' });
      } else {
        db.query(`SELECT * FROM users WHERE username = ?`, [username], (err, rows) => {
          if (err) {
            console.error(err);
            res.status(500).json({ message: 'Error retrieving user data' });
          } else {
            console.log(rows); // Log retrieved data in terminal
            rows.forEach((row) => {
              row.days_since_creation = Math.floor((new Date() - new Date(row.created_at)) / (1000 * 60 * 60 * 24));
              row.created_at = row.created_at.toISOString().split('T')[0]; // Format the created_at timestamp to only show the date
            });
            res.json(rows);
            db.end();
          }
        });
      }
    });
  });








  app.post('/api/deposit', async (req, res) => {
    try {
      const { 
        username, 
        depositAmount, 
        planName, 
        planPrincipleReturn, 
        planCreditAmount, 
        planDepositFee, 
        planDebitAmount, 
        depositMethod 
      } = req.body;
  
      // Validate request body
      if (!username || !planName || !planCreditAmount || !depositAmount || !depositMethod) {
        return res.status(400).json({ message: "Please provide all required fields" });
      }
  
      // Check if user exists
      const [userResult] = await pool.promise().query('SELECT * FROM users WHERE username = ?', [username]);
      const user = userResult[0]; // Select the first user
  
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      // Handle balance deduction if deposit method is balance
      if (depositMethod === 'balance') {
        if (user.balance < depositAmount) {
          return res.status(400).json({ message: 'Insufficient balance' });
        }
        
        // Deduct the deposit amount from user's balance
        await pool.promise().query('UPDATE users SET balance = balance - ? WHERE username = ?', [depositAmount, username]);
      }
  
      // Calculate investment end date based on plan
      const planEndTimes = {
        '20% RIO AFTER 48 HOURS': 48 * 60 * 60 * 1000, // 48 hours in milliseconds
        '50% RIO AFTER 72 HOURS': 72 * 60 * 60 * 1000, // 72 hours in milliseconds
        '100% RIO AFTER 96 HOURS': 96 * 60 * 60 * 1000, // 96 hours in milliseconds
        '200% RIO AFTER 120 HOURS': 120 * 60 * 60 * 1000 // 120 hours in milliseconds
      };
  
      const investmentStartDate = new Date();
      const investmentEndDate = new Date(investmentStartDate.getTime() + (planEndTimes[planName] || 0));
  
      // Insert a new transaction into the transactions table
      await pool.promise().query(
        `INSERT INTO transactions 
         (username, plan_name, plan_principle_return, plan_credit_amount, plan_deposit_fee, plan_debit_amount, deposit_method, transaction_date) 
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [username, planName, planPrincipleReturn, planCreditAmount, planDepositFee, planDebitAmount, depositMethod]
      );
  
      // Insert the same details into the deposits table
      await pool.promise().query(
        `INSERT INTO deposits 
         (user_id, amount, date, investment_start_date, investment_end_date, plan_name, plan_principle_return, plan_credit_amount, plan_deposit_fee, plan_debit_amount, deposit_method, status) 
         VALUES ((SELECT id FROM users WHERE username = ?), ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [username, depositAmount, investmentStartDate, investmentEndDate, planName, planPrincipleReturn, planCreditAmount, planDepositFee, planDebitAmount, depositMethod]
      );
  
      // Send confirmation email
      const emailContent = `
        <div style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4;">
          <table width="100%" style="max-width: 600px; margin: auto; border-collapse: collapse;">
            <tr>
              <td style="text-align: center; padding: 20px;">
                <img src="https://github.com/memecointechh/memecointech/blob/main/images/memecoin%20logo.png?raw=true" alt="Company Logo" style="max-width: 100%; height: auto;" />
              </td>
            </tr>
            <tr>
              <td style="background-color: #3e059b; padding: 20px; text-align: center; color: white;">
                <h1 style="margin: 0;">Deposit Successful!</h1>
              </td>
            </tr>
            <tr>
              <td style="background-color: white; padding: 20px;">
                <p style="font-size: 16px; line-height: 1.5;">Dear ${username},</p>
                <p style="font-size: 16px; line-height: 1.5;">Your deposit of $${depositAmount} has been successfully submitted. The deposit will be reflected in the "Active Deposits" tab once confirmed by the admin after blockchain verification.</p>
                <p style="font-size: 16px; line-height: 1.5;">Thank you for investing with us!</p>
                <a href="https://memecointech-fvh8.onrender.com/signin.html" style="display: inline-block; background-color: #3e059b; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Return to Dashboard</a>
              </td>
            </tr>
            <tr>
              <td style="background-color: #f4f4f4; padding: 10px; text-align: center;">
                <p style="font-size: 12px; color: #666;">&copy; 2023 Your Investment Platform. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </div>
      `;
  
      // Call sendEmail to notify the user
      sendEmail(user.email, 'Deposit Confirmation', emailContent);
  
      res.json({ success: true, message: 'Deposit successful. Confirmation email sent.' });
    } catch (err) {
      console.error('Error processing deposit:', err); // Enhanced error logging
      res.status(500).json({ message: 'Error processing deposit' });
    }
  });


  
  const checkInvestmentEnd = async () => {
    try {
      const now = new Date();
  
      // Find deposits where the end date has passed
      const [deposits] = await pool.promise().query(
        `SELECT * FROM deposits 
         WHERE investment_end_date <= ? AND status = 'pending'`,
        [now]
      );
  
      for (const deposit of deposits) {
        // Update user's balance
        await pool.promise().query(
          `UPDATE users 
           SET balance = balance + ?, total_deposits = total_deposits + ? 
           WHERE id = ?`,
          [deposit.amount, deposit.amount, deposit.user_id]
        );
  
        // Update deposit status to 'completed'
        await pool.promise().query(
          `UPDATE deposits 
           SET status = 'completed' 
           WHERE id = ?`,
          [deposit.id]
        );
      }
  
      console.log('Investment end check completed.');
    } catch (err) {
      console.error('Error checking investments:', err);
    }
  };


// Route to get the number of recent investment packages
app.get('/api/admin/recent-investments', (req, res) => {
  // Query to count recent investments from the last 3 days
  const query = `
      SELECT COUNT(*) AS recent_investments
      FROM investments
      WHERE start_date >= NOW() - INTERVAL 3 DAY;
  `;

  // Execute the query
  pool.query(query, (err, results) => {
      if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ message: 'Error fetching recent investments' });
      }

      // Send the count of recent investments as JSON
      res.json({ recent_investments: results[0].recent_investments });
  });
});

// Endpoint to get the count of pending deposits
app.get('/api/admin/pending-deposits/count', (req, res) => {
  const query = 'SELECT COUNT(*) AS pending_deposits FROM deposits WHERE status = ?';
  
  pool.query(query, ['pending'], (err, results) => {
      if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ message: 'Error fetching pending deposits count' });
      }
      
      // Send the count as a JSON response
      res.json(results[0]);
  });
});


app.get('/api/admin/pending-deposits', (req, res) => {
  const query = 'SELECT id, user_id, amount, plan_name, status, date FROM deposits WHERE status = ?';
  
  pool.query(query, ['pending'], (err, results) => {
      if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ message: 'Error fetching pending deposits' });
      }
      
      res.json(results);
  });
});



// Approve a deposit
app.post('/api/admin/approve-deposit', (req, res) => {
  const { depositId } = req.body;

  // Fetch deposit and plan details, perform necessary operations
  pool.query('SELECT * FROM deposits WHERE id = ?', [depositId], (error, depositResult) => {
    if (error || depositResult.length === 0) {
      console.error('Error fetching deposit details:', error);
      return res.status(404).json({ message: 'Deposit not found' });
    }

    const { user_id, amount, plan_name, investment_start_date } = depositResult[0];

    pool.query('SELECT duration, profit FROM plans WHERE name = ?', [plan_name], (error, planResult) => {
      if (error || planResult.length === 0) {
        console.error('Error fetching plan details:', error);
        return res.status(404).json({ message: 'Plan not found' });
      }

      const { duration, profit } = planResult[0];

      // Calculate dates and profit
      const startDate = new Date(investment_start_date);
      const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);
      const interest = amount * (profit / 100);

      // Approve deposit and insert into active_deposits table
      pool.query(
        'UPDATE deposits SET status = ? WHERE id = ?',
        ['approved', depositId],
        (error) => {
          if (error) {
            console.error('Error approving deposit:', error);
            return res.status(500).json({ message: 'Error approving deposit' });
          }

          pool.query(
            `INSERT INTO active_deposits (user_id, amount, interest, plan_name, profit, investment_start_date, investment_end_date) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user_id, amount, interest, plan_name, profit, startDate, endDate],
            (error) => {
              if (error) {
                console.error('Error inserting into active_deposits:', error);
                return res.status(500).json({ message: 'Error processing active deposit' });
              }

              // Fetch user email to notify them
              pool.query('SELECT email FROM users WHERE id = ?', [user_id], (err, result) => {
                if (err || !result.length) {
                  console.error('Error fetching user email:', err);
                } else {
                  const userEmail = result[0].email;
                  const emailContent = `Your deposit of ${amount} has been approved under the ${plan_name} plan.`;

                  // Send email notification
                  sendEmail(userEmail, 'Deposit Approved', emailContent, (err, info) => {
                    if (err) {
                      console.error('Error sending approval email:', err);
                    }
                  });
                }
              });

              res.json({ message: 'Deposit approved and moved to active deposits successfully.' });
            }
          );
        }
      );
    });
  });
});

// Reject a deposit
app.post('/api/admin/reject-deposit', (req, res) => {
  const { depositId } = req.body;

  pool.query(
    'INSERT INTO rejected_deposits (id, user_id, amount, status, date) SELECT id, user_id, amount, status, date FROM deposits WHERE id = ?',
    [depositId],
    (error, results) => {
      if (error) {
        console.error('Error moving deposit to rejected_deposits:', error);
        return res.status(500).json({ message: 'Error moving deposit to rejected_deposits' });
      }

      const user_id = results.insertId;

      // Remove the deposit from the deposits table
      pool.query('DELETE FROM deposits WHERE id = ?', [depositId], (error) => {
        if (error) {
          console.error('Error deleting deposit:', error);
          return res.status(500).json({ message: 'Error deleting deposit' });
        }

        // Fetch user email to notify them
        pool.query('SELECT email FROM users WHERE id = ?', [user_id], (err, result) => {
          if (err || !result.length) {
            console.error('Error fetching user email:', err);
          } else {
            const userEmail = result[0].email;
            const emailContent = `Your deposit has been rejected. Please contact support for more details.`;

            // Send email notification
            sendEmail(userEmail, 'Deposit Rejected', emailContent, (err, info) => {
              if (err) {
                console.error('Error sending rejection email:', err);
              }
            });
          }
        });

        res.json({ message: 'Deposit rejected successfully.' });
      });
    }
  );
});










// Route to get the total amount withdrawn by all users
app.get('/api/admin/total-withdrawals', (req, res) => {
  const query = 'SELECT SUM(amount) AS totalWithdrawals FROM withdrawals';

  pool.query(query, (err, results) => {
      if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ error: 'Internal server error' });
      }
      
      res.json({ totalWithdrawals: results[0].totalWithdrawals || 0 });
  });
});


// Route to get the total amount deposited by all users
app.get('/api/admin/total-deposits', (req, res) => {
  const query = 'SELECT SUM(amount) AS totalDeposits FROM deposits';

  pool.query(query, (err, results) => {
      if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ error: 'Internal server error' });
      }
      
      res.json({ totalDeposits: results[0].totalDeposits || 0 });
      
  });
});


// Route to get the total available balance for all users
app.get('/api/admin/total-balance', (req, res) => {
  const query = 'SELECT SUM(balance) AS totalBalance FROM users';

  pool.query(query, (err, results) => {
      if (err) {
          console.error('Error querying the database:', err);
          return res.status(500).json({ error: 'Internal server error' });
      }
      
      res.json({ totalBalance: results[0].totalBalance || 0 });
      
  });
});



// Route to fetch bitcoin_address and balance on page load
app.get('/api/user-info', (req, res) => {
  const { username } = req.query; // Username will be sent from the frontend

  pool.query(
      'SELECT bitcoin_address, balance FROM users WHERE username = ?',
      [username],
      (error, results) => {
          if (error) {
              console.error('Error fetching user info:', error);
              return res.status(500).json({ message: 'Error fetching user info.' });
          }
          if (results.length === 0) {
              return res.status(404).json({ message: 'User not found.' });
          }
          const userInfo = results[0];
          res.json(userInfo); // Send the bitcoin_address and balance
      }
  );
});

// Route to handle withdrawal requests
app.post('/api/withdraw', (req, res) => {
  const { username, amount } = req.body;

  // Step 1: Insert withdrawal request into pending_withdrawals table
  pool.query(
    'INSERT INTO pending_withdrawals (username, amount) VALUES (?, ?)',
    [username, amount],
    (error, results) => {
      if (error) {
        console.error('Error inserting withdrawal request:', error);
        return res.status(500).json({ message: 'Error processing withdrawal.' });
      }

      // Step 2: Subtract the withdrawn amount from the user's balance
      pool.query(
        'UPDATE users SET balance = balance - ? WHERE username = ?',
        [amount, username],
        (error, results) => {
          if (error) {
            console.error('Error updating balance:', error);
            return res.status(500).json({ message: 'Error updating balance.' });
          }

          // Fetch user email for notification
          pool.query('SELECT email FROM users WHERE username = ?', [username], (error, results) => {
            if (error || results.length === 0) {
              console.error('Error fetching user email:', error);
              return res.status(500).json({ message: 'Error fetching user email.' });
            }

            const userEmail = results[0].email;

            // Send withdrawal confirmation email
            const emailContent = `
              <div style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4;">
                <table width="100%" style="max-width: 600px; margin: auto; border-collapse: collapse;">
                  <tr>
                    <td style="text-align: center; padding: 20px;">
                      <img src="https://github.com/memecointechh/memecointech/blob/main/images/memecoin%20logo.png?raw=true" alt="Company Logo" style="max-width: 100%; height: auto;" />
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #3e059b; padding: 20px; text-align: center; color: white;">
                      <h1 style="margin: 0;">Withdrawal Request Submitted</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: white; padding: 20px;">
                      <p style="font-size: 16px; line-height: 1.5;">Dear ${username},</p>
                      <p style="font-size: 16px; line-height: 1.5;">We have received your withdrawal request of $${amount}.</p>
                      <p style="font-size: 16px; line-height: 1.5;">Your request is currently pending and will be processed once approved by the admin after the necessary blockchain verification.</p>
                      <p style="font-size: 16px; line-height: 1.5;">Thank you for using our platform!</p>
                      <a href="https://memecointech-fvh8.onrender.com/signin.html" style="display: inline-block; background-color: #3e059b; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Return to Dashboard</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f4f4f4; padding: 10px; text-align: center;">
                      <p style="font-size: 12px; color: #666;">&copy; 2023 Your Investment Platform. All rights reserved.</p>
                    </td>
                  </tr>
                </table>
              </div>
            `;

            sendEmail(userEmail, 'Withdrawal Request Submitted', emailContent);

            // Respond with success message
            res.json({ message: 'Withdrawal request submitted successfully. Your withdrawal is still pending until Admin confirms statistics.' });
          });
        }
      );
    }
  );
});


// Route to get the count of pending deposits
app.get('/api/admin/pending-deposits/count', (req, res) => {
    pool.query(
        'SELECT COUNT(*) AS count FROM pending_deposits',
        (error, results) => {
            if (error) {
                console.error('Error fetching pending deposits count:', error);
                return res.status(500).json({ message: 'Error fetching pending deposits count' });
            }
            const count = results[0].count;
            res.json({ count });
        }
    );
});

// Route to get the count of pending withdrawals
app.get('/api/pending-withdrawals-count', (req, res) => {
  pool.query('SELECT COUNT(*) AS count FROM pending_withdrawals WHERE status = ?', ['pending'], (error, results) => {
      if (error) {
          console.error('Error fetching pending withdrawals count:', error);
          return res.status(500).json({ message: 'Error fetching count' });
      }
      res.json({ count: results[0].count });
  });
});



// Route to get all pending withdrawals for admin
app.get('/api/admin/pending-withdrawals', (req, res) => {
  const query = 'SELECT * FROM pending_withdrawals WHERE status = ?';
  pool.query(query, ['pending'], (error, results) => {
      if (error) {
          console.error('Error fetching pending withdrawals:', error);
          return res.status(500).json({ message: 'Error fetching pending withdrawals' });
      }
      res.json(results);
  });
});


app.get('/api/pending-withdrawals', (req, res) => {
  pool.query('SELECT * FROM pending_withdrawals', (error, results) => {
      if (error) {
          console.error('Error fetching pending withdrawals:', error);
          return res.status(500).json({ message: 'Error fetching pending withdrawals' });
      }
      res.json(results);
  });
});

// Route to get the total number of users
app.get('/api/admin/total-users', (req, res) => {
  pool.query('SELECT COUNT(*) AS total_users FROM users', (error, results) => {
      if (error) {
          console.error('Error fetching total users:', error);
          return res.status(500).json({ message: 'Error fetching total users.' });
      }
      res.json(results[0]);
  });
});


// Route to get all users' details
app.get('/api/admin/users', (req, res) => {
  const query = `
      SELECT id, full_name, email, username, bitcoin_address, referral_code, created_at, balance, total_withdrawals, total_deposits
      FROM users
  `;
  pool.query(query, (error, results) => {
      if (error) {
          console.error('Error fetching user details:', error);
          return res.status(500).json({ message: 'Error fetching user details.' });
      }
      res.json(results);
  });
});


// Route to approve a pending withdrawal
app.post('/api/admin/approve-withdrawal', (req, res) => {
  const { id, username, amount } = req.body;

  // Update status to 'approved' in the pending_withdrawals table
  pool.query('UPDATE pending_withdrawals SET status = ? WHERE id = ?', ['approved', id], (error, result) => {
      if (error) {
          console.error('Error approving withdrawal:', error);
          return res.status(500).json({ message: 'Error approving withdrawal' });
      }

      // Subtract amount from user's balance
      pool.query('UPDATE users SET balance = balance - ? WHERE username = ?', [amount, username], (err, updateResult) => {
          if (err) {
              console.error('Error updating user balance:', err);
              return res.status(500).json({ message: 'Error updating user balance' });
          }
          res.json({ message: 'Withdrawal approved successfully!' });
      });
  });
});

// Route to reject a pending withdrawal
app.post('/api/admin/reject-withdrawal', (req, res) => {
  const { id, username, amount } = req.body;

  // Update status to 'rejected'
  pool.query('UPDATE pending_withdrawals SET status = ? WHERE id = ?', ['rejected', id], (error, result) => {
      if (error) {
          console.error('Error rejecting withdrawal:', error);
          return res.status(500).json({ message: 'Error rejecting withdrawal' });
      }

      // Refund the amount back to the user's balance
      pool.query('UPDATE users SET balance = balance + ? WHERE username = ?', [amount, username], (err, updateResult) => {
          if (err) {
              console.error('Error updating user balance:', err);
              return res.status(500).json({ message: 'Error updating user balance' });
          }
          res.json({ message: 'Withdrawal rejected and amount refunded successfully!' });
      });
  });
});






// Function to check for completed investments
async function checkCompletedInvestments() {
  try {
    // Get the current date
    const currentDate = new Date();
    
    // Query for completed investments
    const [completedDeposits] = await pool.promise().query(
      'SELECT * FROM active_deposits WHERE investment_end_date <= ?',
      [currentDate]
    );

    for (const deposit of completedDeposits) {
      const { user_id, amount, interest, plan_name, investment_end_date } = deposit;

      // Update the user's balance
      await pool.promise().query(
        'UPDATE users SET balance = balance + ? WHERE id = ?',
        [amount + interest, user_id]
      );

      // Archive the completed deposit
      await pool.promise().query(
        'INSERT INTO completed_deposits (user_id, amount, interest, plan_name, investment_start_date, investment_end_date) VALUES (?, ?, ?, ?, ?, ?)',
        [user_id, amount, interest, plan_name, deposit.investment_start_date, investment_end_date]
      );

      // Delete the deposit from active_deposits
      await pool.promise().query(
        'DELETE FROM active_deposits WHERE id = ?',
        [deposit.id]
      );
    }

    console.log('Completed investments processed successfully');
  } catch (err) {
    console.error('Error processing completed investments:', err);
  }
}

// Schedule the cron job to run every hour
cron.schedule('0 * * * *', () => {
  console.log('Running scheduled task to check completed investments');
  checkCompletedInvestments();
});


app.get('/api/user-dashboard', async (req, res) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    // Fetch data from all relevant tables
    const [activeDepositResult] = await pool.promise().query(
      'SELECT amount FROM active_deposits WHERE user_id = (SELECT id FROM users WHERE username = ?) ORDER BY investment_end_date DESC LIMIT 1',
      [username]
    );
    const mostRecentActiveDeposit = activeDepositResult.length > 0 ? activeDepositResult[0].amount : 0;

    const [pendingWithdrawalsResult] = await pool.promise().query(
      'SELECT SUM(amount) AS totalPendingWithdrawals FROM pending_withdrawals WHERE username = ? AND status = "pending"',
      [username]
    );
    const totalPendingWithdrawals = pendingWithdrawalsResult[0].totalPendingWithdrawals || 0;

    const [totalWithdrawnResult] = await pool.promise().query(
      'SELECT SUM(amount) AS totalWithdrawn FROM pending_withdrawals WHERE username = ? AND status = "approved"',
      [username]
    );
    const totalWithdrawn = totalWithdrawnResult[0].totalWithdrawn || 0;

    const [totalEarnedResult] = await pool.promise().query(
      'SELECT SUM(amount) AS totalEarned FROM earnings WHERE user_id = (SELECT id FROM users WHERE username = ?)',
      [username]
    );
    const totalEarned = totalEarnedResult[0].totalEarned || 0;

    const [lastDepositResult] = await pool.promise().query(
      'SELECT amount FROM deposits WHERE user_id = (SELECT id FROM users WHERE username = ?) ORDER BY date DESC LIMIT 1',
      [username]
    );
    const lastDeposit = lastDepositResult.length > 0 ? lastDepositResult[0].amount : 0;

    const [totalDepositsResult] = await pool.promise().query(
      'SELECT total_deposits FROM users WHERE username = ?',
      [username]
    );
    const totalDeposits = totalDepositsResult.length > 0 ? totalDepositsResult[0].total_deposits : 0;

    const [lastWithdrawalResult] = await pool.promise().query(
      'SELECT amount FROM pending_withdrawals WHERE username = ? ORDER BY request_date DESC LIMIT 1',
      [username]
    );
    const lastWithdrawal = lastWithdrawalResult.length > 0 ? lastWithdrawalResult[0].amount : 0;

    // Send the response with all the data
    res.json({
      mostRecentActiveDeposit,
      totalPendingWithdrawals,
      totalWithdrawn,
      totalEarned,
      lastDeposit,
      totalDeposits,
      lastWithdrawal
    });
  } catch (err) {
    console.error('Error fetching user dashboard data:', err);
    res.status(500).json({ message: 'Error fetching user dashboard data' });
  }
});


// Endpoint to get user details
app.get('/api/admin/user-details', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Fetch user details from the database
    const [result] = await pool.promise().query(
      'SELECT id, full_name, email, username, bitcoin_address, referral_code, created_at, balance, total_withdrawals, total_deposits FROM users WHERE id = ?',
      [userId]
    );

    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Send the user details as the response
    res.json(result[0]);
  } catch (err) {
    console.error('Error fetching user details:', err);
    res.status(500).json({ message: 'Error fetching user details' });
  }
});
 


// Route to handle adding a penalty
app.post('/api/admin/add-penalty', async (req, res) => {
  const { userId, penaltyAmount, penaltyType, description, authPassword } = req.body;

  if (authPassword !== 'AdMiN') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  try {
    // Find user by userId
    const [user] = await pool.promise().query('SELECT * FROM users WHERE id = ?', [userId]);

    if (user.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Deduct penalty from the user's balance
    const newBalance = user[0].balance - parseFloat(penaltyAmount);

    // Update user's balance
    await pool.promise().query('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId]);

    // Log penalty in penalties table
    await pool.promise().query('INSERT INTO penalties (user_id, amount, type, description) VALUES (?, ?, ?, ?)', [
        userId,
        penaltyAmount,
        penaltyType,
        description
    ]);

    // Send success response
    res.json({ success: true });

  } catch (error) {
    console.error('Error adding penalty:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});





async function addBonus(userId, amount, description) {
  return new Promise((resolve, reject) => {
    // Fetch username based on userId
    pool.query('SELECT username FROM users WHERE id = ?', [userId], (err, results) => {
      if (err) return reject(err);
      if (!results.length) return reject(new Error('User not found'));

      const username = results[0].username;

      // Update user balance
      pool.query(
        'UPDATE users SET balance = balance + ? WHERE id = ?',
        [amount, userId],
        (err, results) => {
          if (err) return reject(err);
          
          // Insert into transactions table
          pool.query(
            `INSERT INTO transactions (username, plan_name, plan_credit_amount, deposit_method, transaction_date) 
             VALUES (?, ?, ?, ?, ?)`,
            [username, null, amount, 'Bonus', new Date()],
            (err, result) => {
              if (err) return reject(err);
              resolve(result);
            }
          );
        }
      );
    });
  });
}



async function logTransaction(username, planName, amount, description) {
  const transactionDate = new Date();
  await pool.promise().query(
    `INSERT INTO transactions (username, plan_name, plan_credit_amount, deposit_method, transaction_date) 
     VALUES (?, ?, ?, ?, ?)`,
    [username, planName, amount, 'Bonus/Investment', transactionDate]
  );
}

app.post('/api/admin/add-bonus-or-investment', async (req, res) => {
  const { userId, amount, actionType, planId, description, authPassword } = req.body;

  try {
    // Authenticate admin's password before proceeding
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (authPassword !== adminPassword) {
      return res.status(401).json({ message: 'Invalid admin password' });
    }

    // Fetch username based on userId
    const [user] = await pool.promise().query('SELECT username FROM users WHERE id = ?', [userId]);
    if (!user.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const username = user[0].username;

    if (actionType === 'bonus') {
      // Handle the existing bonus logic
      await addBonus(userId, amount, description);
      await logTransaction(username, null, null, description); // Pass username
      return res.json({ success: true, message: 'Bonus added successfully' });
    }

    if (actionType === 'investment') {
      const [plan] = await pool.promise().query('SELECT * FROM plans WHERE id = ?', [planId]);
      if (!plan.length) {
        return res.status(404).json({ message: 'Plan not found' });
      }

      const { duration, profit } = plan[0];
      const investmentStartDate = new Date();
      const investmentEndDate = new Date(investmentStartDate.getTime() + duration * 60 * 60 * 1000);
      const interest = amount * (profit / 100);

      // Debugging: Log userId and other variables
      console.log('Inserting investment with:', {
        userId,
        amount,
        interest,
        planName: plan[0].name,  // Fixed reference
        profit,
        investmentStartDate,
        investmentEndDate,
      });

      // Insert the new investment into the active_deposits table
      await pool.promise().query(
        `INSERT INTO active_deposits (user_id, amount, interest, plan_name, profit, investment_start_date, investment_end_date) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, amount, interest, plan[0].name, profit, investmentStartDate, investmentEndDate]
      );

      // Log the transaction in the transactions table
      await logTransaction(username, plan[0].name, amount, description); // Use username

      return res.json({ success: true, message: 'Investment added successfully' });
    }

    res.status(400).json({ message: 'Invalid action type' });
  } catch (err) {
    console.error('Error in add-bonus-or-investment:', err);
    res.status(500).json({ message: 'Error in add-bonus-or-investment' });
  }
});







app.get('/api/expiring-deposits', async (req, res) => {
  try {
      const [deposits] = await pool.promise().query(`
          SELECT *, DATEDIFF(investment_end_date, NOW()) AS days_left
          FROM active_deposits
          WHERE investment_end_date > NOW()
      `);
      res.json(deposits);
  } catch (err) {
      console.error('Error fetching expiring deposits:', err);
      res.status(500).json({ message: 'Error fetching expiring deposits' });
  }
});





















app.get('/get-account-details', (req, res) => {
  const username = req.query.username;

  if (!username) {
      return res.json({ success: false, message: "Username is required." });
  }

  // Get a connection from the pool
  pool.getConnection((err, connection) => {
      if (err) {
          return res.json({ success: false, message: "Error connecting to the database." });
      }

      // Query user data based on the username to get user_id
      const userQuery = `SELECT id, full_name, username, created_at, balance FROM users WHERE username = ?`;
      connection.query(userQuery, [username], (err, userResults) => {
          if (err) {
              connection.release(); // Release connection back to the pool
              return res.json({ success: false, message: "Error fetching user data." });
          }

          if (userResults.length === 0) {
              connection.release(); // Release connection back to the pool
              return res.json({ success: false, message: "User not found." });
          }

          const user = userResults[0];
          const userId = user.id;

          // Query approved deposits using user_id
          const approvedDepositsQuery = `SELECT amount, date FROM deposits WHERE user_id = ? AND status = 'approved'`;
          connection.query(approvedDepositsQuery, [userId], (err, approvedDeposits) => {
              if (err) {
                  connection.release(); // Release connection back to the pool
                  return res.json({ success: false, message: "Error fetching approved deposits." });
              }

              // Query pending deposits using user_id
              const pendingDepositsQuery = `SELECT amount, date FROM deposits WHERE user_id = ? AND status = 'pending'`;
              connection.query(pendingDepositsQuery, [userId], (err, pendingDeposits) => {
                  connection.release(); // Release connection after the last query

                  if (err) {
                      return res.json({ success: false, message: "Error fetching pending deposits." });
                  }

                  // Return account details, approved deposits, and pending deposits
                  res.json({
                      success: true,
                      full_name: user.full_name,
                      username: user.username,
                      created_at: user.created_at,
                      balance: user.balance,
                      approvedDeposits: approvedDeposits,
                      pendingDeposits: pendingDeposits
                  });
              });
          });
      });
  });
});


app.get('/get-withdrawal-history', (req, res) => {
  const username = req.query.username;

  if (!username) {
      return res.json({ success: false, message: "Username is required." });
  }

  pool.getConnection((err, connection) => {
      if (err) {
          return res.json({ success: false, message: "Error connecting to the database." });
      }

      // Fetch all withdrawals (both pending and approved)
      const withdrawalQuery = `SELECT amount, status, request_date, approved_date FROM pending_withdrawals WHERE username = ?`;

      connection.query(withdrawalQuery, [username], (err, results) => {
          connection.release(); // Release connection back to the pool
          
          if (err) {
              return res.json({ success: false, message: "Error fetching withdrawal history." });
          }

          res.json({ success: true, withdrawals: results });
      });
  });
});






// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Dynamic route to serve other HTML pages
app.get('/:page', (req, res) => {
    const page = req.params.page;
    res.sendFile(path.join(__dirname, `${page}.html`));
});

// Catch-all route for any unmatched routes
app.get('*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// Handle favicon requests
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();  // No Content
});



// Test the connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to the database:', err);
    } else {
        console.log('Connected to the database');
        connection.release();  // Release the connection back to the pool
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
