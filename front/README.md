# 🏗️ BimSoda - BIM Viewer & Project Management Platform

## 📋 Overview

BimSoda is a modern web-based platform for viewing, managing, and collaborating on BIM (Building Information Modeling) projects. Built with Next.js and TypeScript, it provides a powerful interface for working with IFC files and managing project access.

## ✨ Features

### 🎯 Core Features
- **IFC File Viewer**: Advanced 3D visualization of BIM models
- **Project Management**: Create and manage BIM projects
- **Access Control**: Granular access levels (Viewer, Public, Admin)
- **User Collaboration**: Share projects with team members
- **Comments System**: Add comments to specific model elements
- **Collision Detection**: Automatic detection of model collisions

### 🔐 Access Levels
- **Viewer**: Basic viewing access
- **Public**: Shared access for team members
- **Admin**: Full project control

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Modern web browser

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/BimSoda.git
cd BimSoda
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```
Edit `.env.local` with your configuration.

4. Run the development server:
```bash
npm run dev
# or
yarn dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🛠️ Tech Stack

- **Frontend**: 
  - Next.js 14
  - TypeScript
  - Tailwind CSS
  - Three.js
  - IFC.js

- **Backend**:
  - ASP.NET Core
  - Entity Framework
  - SQL Server

## 📁 Project Structure

```
BimSoda/
├── src/
│   ├── app/
│   │   ├── components/     # Reusable UI components
│   │   ├── config/        # Configuration files
│   │   ├── services/      # API services
│   │   └── types/         # TypeScript type definitions
│   ├── public/            # Static assets
│   └── styles/            # Global styles
├── prisma/                # Database schema
└── tests/                 # Test files
```

## 🔄 API Integration

### Authentication
```typescript
// Login
POST /api/auth/login
{
  "login": "user1",
  "password": "password"
}

// Register
POST /api/auth/register
{
  "login": "user1",
  "userName": "John",
  "userSurname": "Doe",
  "email": "john@example.com",
  "password": "password",
  "companyName": "ACME Corp",
  "companyPosition": "Architect"
}
```

### Projects
```typescript
// Create Project
POST /api/project
{
  "creatorId": 1,
  "title": "New Project"
}

// Get User Projects
GET /api/project?userId=1
```

## 🎨 UI Components

### Project Card
```tsx
<ProjectCard
  title="Project Name"
  creator="John Doe"
  accessLevel="viewer"
  lastModified="2024-03-20"
/>
```

### Viewer Component
```tsx
<Viewer
  file={ifcFile}
  isAuthenticated={true}
/>
```

## 🔒 Security

- JWT-based authentication
- Role-based access control
- Secure file handling
- Input validation
- XSS protection

## 🧪 Testing

```bash
# Run unit tests
npm run test

# Run e2e tests
npm run test:e2e
```

## 📈 Performance

- Lazy loading of IFC models
- Optimized 3D rendering
- Efficient state management
- Caching strategies

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Team

- **Lead Developer** - [Your Name]
- **UI/UX Designer** - [Designer Name]
- **Backend Developer** - [Backend Dev Name]

## 🙏 Acknowledgments

- IFC.js team for the amazing BIM viewer
- Next.js team for the framework
- All contributors and supporters

## 📞 Support

For support, email support@bimsoda.com or join our Slack channel.

---

Made with ❤️ by the BimSoda Team
