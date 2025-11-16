import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { formatDate, formatDateTime } from '../utils/dateUtils';
import './UserManagementPage.css';
import './DataPage.css';

function UserManagementPage({ userTimezone = 'UTC' }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [message, setMessage] = useState(null);
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'ReadOnly'
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await axios.get('/api/users');
      setUsers(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error loading users:', error);
      setMessage({ type: 'error', text: 'Failed to load users' });
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    try {
      if (editingUser) {
        // Update existing user
        const updateData = {
          username: formData.username,
          role: formData.role
        };
        if (formData.password) {
          updateData.password = formData.password;
        }

        await axios.put(`/api/users/${editingUser.id}`, updateData);
        setMessage({ type: 'success', text: 'User updated successfully' });
      } else {
        // Create new user
        await axios.post('/api/users', formData);
        setMessage({ type: 'success', text: 'User created successfully' });
      }

      // Reset form and reload users
      setFormData({ username: '', password: '', role: 'ReadOnly' });
      setShowAddForm(false);
      setEditingUser(null);
      loadUsers();
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Operation failed' 
      });
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      role: user.role
    });
    setShowAddForm(true);
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    try {
      await axios.delete(`/api/users/${userId}`);
      setMessage({ type: 'success', text: 'User deleted successfully' });
      loadUsers();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to delete user'
      });
    }
  };

  const handleCancel = () => {
    setFormData({ username: '', password: '', role: 'ReadOnly' });
    setShowAddForm(false);
    setEditingUser(null);
  };

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  return (
    <div className="user-management-page">
      <div className="page-header">
        <h1>User Management</h1>
        <button 
          onClick={() => setShowAddForm(!showAddForm)} 
          className="btn btn-primary"
        >
          {showAddForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {showAddForm && (
        <div className="user-form-container">
          <h2>{editingUser ? 'Edit User' : 'Create New User'}</h2>
          <form onSubmit={handleSubmit} className="user-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">
                Password {editingUser && '(leave blank to keep current)'}
              </label>
              <input
                type="password"
                id="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                required={!editingUser}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="role">Role</label>
              <select
                id="role"
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
                className="form-input"
              >
                <option value="Admin">Admin</option>
                <option value="Support">Support</option>
                <option value="ReadOnly">Read Only</option>
              </select>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingUser ? 'Update User' : 'Create User'}
              </button>
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Created</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="username-cell">{user.username}</td>
                <td>
                  <span className={`role-badge role-${user.role.toLowerCase()}`}>
                    {user.role}
                  </span>
                </td>
                <td>{formatDate(user.created_at, userTimezone)}</td>
                <td>
                  {user.last_login 
                    ? formatDateTime(user.last_login, userTimezone)
                    : 'Never'}
                </td>
                <td className="actions-cell">
                  <button
                    className="action-button edit-button"
                    onClick={() => handleEdit(user)}
                  >
                    Edit
                  </button>
                  <button
                    className="action-button delete-button"
                    onClick={() => handleDelete(user.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UserManagementPage;
