import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy } from 'react';
import PhoneShell from './components/layout/PhoneShell';
import HomeFeed from './screens/HomeFeed';

// Route-level code splitting (A6): only the home feed (the landing screen)
// ships in the initial bundle; every other screen loads on first visit.
// PhoneShell wraps each route in <Suspense>, so the tab bar stays put
// while a screen's chunk loads.
const Login = lazy(() => import('./Login'));
const Signup = lazy(() => import('./Signup'));
const CreatePost = lazy(() => import('./CreatePost'));
const EditProfile = lazy(() => import('./EditProfile'));
const ForgotPassword = lazy(() => import('./ForgotPassword'));
const ResetPassword = lazy(() => import('./ResetPassword'));
const Notifications = lazy(() => import('./Notifications'));
const Messages = lazy(() => import('./Messages'));
const Conversation = lazy(() => import('./Conversation'));
const Search = lazy(() => import('./Search'));
const MenuScreen = lazy(() => import('./screens/MenuScreen'));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'));
const BlockedUsersScreen = lazy(() => import('./screens/BlockedUsersScreen'));
const SavedPostsScreen = lazy(() => import('./screens/SavedPostsScreen'));
const PostDetailScreen = lazy(() => import('./screens/PostDetailScreen'));
const HashtagFeedScreen = lazy(() => import('./screens/HashtagFeedScreen'));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'));
const FollowRequestsScreen = lazy(() => import('./screens/FollowRequestsScreen'));
const AccountManagementScreen = lazy(() => import('./screens/AccountManagementScreen'));
const VerifyEmailScreen = lazy(() => import('./screens/VerifyEmailScreen'));
const ExploreScreen = lazy(() => import('./screens/ExploreScreen'));
const CreateGroupScreen = lazy(() => import('./screens/CreateGroupScreen'));
const GroupInfoScreen = lazy(() => import('./screens/GroupInfoScreen'));
const NotificationSettingsScreen = lazy(() => import('./screens/NotificationSettingsScreen'));
const AdminScreen = lazy(() => import('./screens/AdminScreen'));
const GroupsScreen = lazy(() => import('./screens/GroupsScreen'));
const CreateCommunityScreen = lazy(() => import('./screens/CreateCommunityScreen'));
const CommunityScreen = lazy(() => import('./screens/CommunityScreen'));
const ManageCommunityScreen = lazy(() => import('./screens/ManageCommunityScreen'));
const PagesScreen = lazy(() => import('./screens/PagesScreen'));
const LanguageScreen = lazy(() => import('./screens/LanguageScreen'));
const LegalScreen = lazy(() => import('./screens/LegalScreen'));
const CreatePageScreen = lazy(() => import('./screens/CreatePageScreen'));
const PageScreen = lazy(() => import('./screens/PageScreen'));
const EditPageScreen = lazy(() => import('./screens/EditPageScreen'));

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Wrapped per-route (not the whole <Routes> tree) so each route
            can choose hideTabBar. */}
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

        {/* Pre-rebrand pages, migrated into the shell in A3. */}
        <Route path="/login" element={<PhoneShell hideTabBar><Login /></PhoneShell>} />
        <Route path="/signup" element={<PhoneShell hideTabBar><Signup /></PhoneShell>} />
        {/* Old pre-rebrand feed page, now retired -- "/" is the only home
            feed route. Redirected (not deleted outright) so old links/
            bookmarks still land somewhere real instead of a dead route. */}
        <Route path="/feed" element={<Navigate to="/" replace />} />
        <Route path="/create-post" element={<PhoneShell><CreatePost /></PhoneShell>} />
        <Route path="/edit-profile" element={<PhoneShell><EditProfile /></PhoneShell>} />
        <Route path="/forgot-password" element={<PhoneShell hideTabBar><ForgotPassword /></PhoneShell>} />
        <Route path="/reset-password/:token" element={<PhoneShell hideTabBar><ResetPassword /></PhoneShell>} />
        <Route path="/notifications" element={<PhoneShell><Notifications /></PhoneShell>} />
        <Route path="/messages" element={<PhoneShell><Messages /></PhoneShell>} />
        <Route path="/messages/new-group" element={<PhoneShell hideTabBar><CreateGroupScreen /></PhoneShell>} />
        <Route path="/messages/:conversationId/info" element={<PhoneShell hideTabBar><GroupInfoScreen /></PhoneShell>} />
        <Route path="/messages/:conversationId" element={<PhoneShell hideTabBar><Conversation /></PhoneShell>} />
        <Route path="/search" element={<PhoneShell><Search /></PhoneShell>} />
        <Route path="/explore" element={<PhoneShell><ExploreScreen /></PhoneShell>} />
        <Route path="/settings/notifications" element={<PhoneShell><NotificationSettingsScreen /></PhoneShell>} />
        <Route path="/admin" element={<PhoneShell><AdminScreen /></PhoneShell>} />
        <Route path="/groups" element={<PhoneShell><GroupsScreen /></PhoneShell>} />
        <Route path="/groups/new" element={<PhoneShell hideTabBar><CreateCommunityScreen /></PhoneShell>} />
        <Route path="/groups/:id" element={<PhoneShell><CommunityScreen /></PhoneShell>} />
        <Route path="/groups/:id/manage" element={<PhoneShell hideTabBar><ManageCommunityScreen /></PhoneShell>} />
        <Route path="/pages" element={<PhoneShell><PagesScreen /></PhoneShell>} />
        <Route path="/settings/language" element={<PhoneShell><LanguageScreen /></PhoneShell>} />
        {/* C2: public legal pages (no login needed). */}
        <Route path="/terms" element={<PhoneShell hideTabBar><LegalScreen doc="terms" /></PhoneShell>} />
        <Route path="/privacy" element={<PhoneShell hideTabBar><LegalScreen doc="privacy" /></PhoneShell>} />
        <Route path="/pages/new" element={<PhoneShell hideTabBar><CreatePageScreen /></PhoneShell>} />
        <Route path="/pages/:id" element={<PhoneShell><PageScreen /></PhoneShell>} />
        <Route path="/pages/:id/edit" element={<PhoneShell hideTabBar><EditPageScreen /></PhoneShell>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;