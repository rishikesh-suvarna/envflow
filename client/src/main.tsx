import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './pages/App';
import Login from './pages/Login';
import Projects from './pages/Projects';
import ProjectSecrets from './pages/ProjectSecrets';
import Register from './pages/Register';
import './styles.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Projects /> },
      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
      { path: 'projects/:projectId', element: <ProjectSecrets /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
