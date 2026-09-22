import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Signup from './Signup';
import CreatePost from './CreatePost';
import EditProfile from './EditProfile';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import Notifications from './Notifications';
import Messages from './Messages';
import Conversation from './Conversation';
import Search from './Search';
import PhoneShell from './components/layout/PhoneShell';
import HomeFeed from './screens/HomeFeed';
import MenuScreen from './screens/MenuScreen';
import SettingsScreen from './screens/SettingsScreen';
import BlockedUsersScreen from './screens/BlockedUsersScreen';
import SavedPostsScreen from './screens/SavedPostsScreen';
import PostDetailScreen from './screens/PostDetailScreen';
import HashtagFeedScreen from './screens/HashtagFeedScreen';
import ProfileScreen from './screens/ProfileScreen';
import FollowRequestsScreen from './screens/FollowRequestsScreen';
import AccountManagementScreen from './screens/AccountManagementScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* New rebrand screens only -- wrapped per-route (not the whole
            <Routes> tree) so the existing screens below are untouched and
            keep rendering exactly as before. See PhoneShell.jsx's own
            comment for why. */}
        <Route
          path="/"
          element={
            <PhoneShell>
              <HomeFeed />
            </PhoneShell>
          }
        />
        <Route
          path="/menu"
          element={
            <PhoneShell>
              <MenuScreen />
            </PhoneShell>
          }
        />
        <Route
          path="/settings"
          element={
            <PhoneShell>
              <SettingsScreen />
            </PhoneShell>
          }
        />
        <Route
          path="/settings/blocked-users"
          element={
            <PhoneShell>
              <BlockedUsersScreen />
            </PhoneShell>
          }
        />
        <Route
          path="/saved"
          element={
            <PhoneShell>
              <SavedPostsScreen />
            </PhoneShell>
          }
        />
        <Route
          path="/posts/:id"
          element={
            <PhoneShell>
              <PostDetailScreen />
            </PhoneShell>
          }
        />
        <Route
          path="/hashtag/:tag"
          element={
            <PhoneShell>
              <HashtagFeedScreen />
            </PhoneShell>
          }
        />
        <Route
          path="/profile/:id"
          element={
            <PhoneShell>
              <ProfileScreen />
            </PhoneShell>
          }
        />
        <Route
          path="/settings/follow-requests"
          element={
            <PhoneShell>
              <FollowRequestsScreen />
            </PhoneShell>
          }
        />
        <Route
          path="/settings/account"
          element={
            <PhoneShell>
              <AccountManagementScreen />
            </PhoneShell>
          }
        />
        <Route
          path="/verify-email/:token"
          element={
            <PhoneShell>
              <VerifyEmailScreen />
            </PhoneShell>
          }
        />

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        {/* Old pre-rebrand feed page, now retired -- "/" is the only home
            feed route. Redirected (not deleted outright) so old links/
            bookmarks still land somewhere real instead of a dead route. */}
        <Route path="/feed" element={<Navigate to="/" replace />} />
        <Route path="/create-post" element={<CreatePost />} />
        <Route path="/edit-profile" element={<EditProfile />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/messages/:conversationId" element={<Conversation />} />
        <Route path="/search" element={<Search />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;