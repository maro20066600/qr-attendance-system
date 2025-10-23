# QR Attendance System

A full-stack web application for managing employee attendance using QR codes.

## Features

- **HR Login System**: Secure login with default credentials (admin/1234)
- **CSV Upload**: Upload employee data with columns: id, name, team, governorate
- **QR Code Generation**: Automatic QR code generation for each employee
- **Attendance Tracking**: Mark attendance by scanning QR codes
- **Attendance Records**: View and download attendance logs as CSV
- **Session Management**: Secure session-based authentication

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: HTML + TailwindCSS + JavaScript
- **Database**: JSON files (members.json, attendance.json)
- **QR Code**: qrcode npm library
- **File Upload**: multer

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

3. Open your browser and navigate to:
```
http://localhost:3000/login
```

## Default Credentials

- **Username**: admin
- **Password**: 1234

## Usage

### 1. Login
- Navigate to `/login`
- Enter credentials: admin / 1234

### 2. Upload CSV
- Go to Dashboard
- Upload a CSV file with columns: id, name, team, governorate
- QR codes will be generated automatically

### 3. Scan QR Codes
- Go to Scan page
- Use the QR code URL: `http://localhost:3000/scan?id=<employee_id>`
- If logged in as HR, click "Mark Present" to record attendance

### 4. View Attendance
- Go to Attendance page
- View all attendance records
- Download attendance data as CSV

## File Structure

```
qr-attendance-system/
├── server.js              # Express server
├── package.json           # Dependencies
├── public/
│   ├── login.html         # Login page
│   ├── dashboard.html     # Dashboard with CSV upload
│   ├── scan.html          # QR scan page
│   └── attendance.html    # Attendance records page
├── data/
│   ├── members.json       # Employee data
│   └── attendance.json    # Attendance logs
└── uploads/               # Temporary CSV uploads
```

## API Endpoints

- `GET /login` - Login page
- `POST /api/login` - Login endpoint
- `POST /api/logout` - Logout endpoint
- `GET /dashboard` - Dashboard page
- `POST /api/upload-csv` - Upload CSV file
- `GET /api/members` - Get all members
- `GET /api/generate-qr/:id` - Generate QR code for member
- `GET /scan` - Scan page
- `GET /api/member/:id` - Get member details
- `POST /api/mark-present/:id` - Mark attendance
- `GET /api/attendance` - Get attendance records
- `GET /api/attendance-csv` - Download attendance as CSV
- `GET /attendance` - Attendance records page

## Notes

- All data is stored in JSON files in the `data/` directory
- QR codes are generated as data URLs (base64 encoded images)
- Sessions expire after 24 hours
- Only logged-in HR can upload CSV and mark attendance
