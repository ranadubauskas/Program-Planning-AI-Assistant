import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import PlanDetails from './pages/PlanDetails';
import SavedEvents from './pages/SavedEvents';
import PublicEvent from './pages/PublicEvent';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    
    if (token && userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (error) {
        console.error('Error parsing user data:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData, token) => {
    setUser(userData);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-vanderbilt-gold"></div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        {user && <Header user={user} onLogout={handleLogout} />}
        
        <Routes>
          <Route 
            path="/login" 
            element={
              user ? <Navigate to="/dashboard" /> : <Login onLogin={handleLogin} />
            } 
          />
          <Route 
            path="/dashboard" 
            element={
              user ? <Dashboard user={user} /> : <Navigate to="/login" />
            } 
          />
          <Route 
            path="/chat/:planId?" 
            element={
              user ? <Chat user={user} /> : <Navigate to="/login" />
            } 
          />
          <Route 
            path="/plan/:planId" 
            element={
              user ? <PlanDetails user={user} /> : <Navigate to="/login" />
            } 
          />
          <Route 
            path="/events" 
            element={
              user ? <SavedEvents user={user} /> : <Navigate to="/login" />
            } 
          />
          <Route 
            path="/events/:eventId" 
            element={
              user ? <SavedEvents user={user} /> : <Navigate to="/login" />
            } 
          />
          <Route 
            path="/public/events/:shareId" 
            element={<PublicEvent />} 
          />
          <Route 
            path="/" 
            element={<Navigate to={user ? "/dashboard" : "/login"} />} 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
