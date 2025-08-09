# Simple Private Chat Web App

This is a minimal 1-on-1 chat website using Firebase Realtime Database.

## Features

- Simple access code authentication (guest or owner)
- Owner access requires a special code + password
- Guests join rooms based on their access code
- Real-time messaging with timestamps
- Clean and minimal UI

## How to Use

1. Open the website URL.
2. Enter your **access code**:
   - Guests use one of the predefined guest codes.
   - Owner uses the owner access code.
3. If you enter the owner code, you'll be asked for a password.
4. Guests will be prompted to enter their display name.
5. Start chatting in your private room!

## Setup

- This project uses Firebase Realtime Database.
- If you want to deploy your own copy:
  - Replace the Firebase config in `script.js` with your own.
  - Update guest codes and owner credentials as needed.

## Notes

- Multiple users with the same guest code share the same chat room.
- Owner has special privileges.

---
