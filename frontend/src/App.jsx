import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import PhoneShell from './components/layout/PhoneShell';
import RequireAuth from './components/auth/RequireAuth';
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
const MutedUsersScreen = lazy(() => import('./screens/MutedUsersScreen'));
const RestrictedUsersScreen = lazy(() => import('./screens/RestrictedUsersScreen'));
const CloseFriendsScreen = lazy(() => import('./screens/CloseFriendsScreen'));
const InteractionsScreen = lazy(() => import('./screens/InteractionsScreen'));
const ActivityScreen = lazy(() => import('./screens/ActivityScreen'));
const SessionsScreen = lazy(() => import('./screens/SessionsScreen'));
const SavedPostsScreen = lazy(() => import('./screens/SavedPostsScreen'));
const DraftsScreen = lazy(() => import('./screens/DraftsScreen'));
const CollectionScreen = lazy(() => import('./screens/CollectionScreen'));
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
const LandingScreen = lazy(() => import('./screens/LandingScreen'));
const CreatePageScreen = lazy(() => import('./screens/CreatePageScreen'));
const PageScreen = lazy(() => import('./screens/PageScreen'));
const EditPageScreen = lazy(() => import('./screens/EditPageScreen'));
const ConnectionsScreen = lazy(() => import('./screens/ConnectionsScreen'));

// Day 30: routes that need an account (see RequireAuth). Public browsing
// -- a post, profile, page, group, hashtag, explore, search, the legal and
// sign-in screens, and the language picker -- stays open to everyone.
const authOnly = (element) => <RequireAuth>{element}</RequireAuth>;

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
          element={authOnly(
            <PhoneShell>
              <MenuScreen />
            </PhoneShell>
          )}
        />
        <Route
          path="/settings"
          element={authOnly(
            <PhoneShell>
              <SettingsScreen />
            </PhoneShell>
          )}
        />
        <Route
          path="/settings/sessions"
          element={authOnly(
            <PhoneShell>
              <SessionsScreen />
            </PhoneShell>
          )}
        />
        <Route
          path="/settings/blocked-users"
          element={authOnly(
            <PhoneShell>
              <BlockedUsersScreen />
            </PhoneShell>
          )}
        />
        <Route
          path="/saved"
          element={authOnly(
            <PhoneShell>
              <SavedPostsScreen />
            </PhoneShell>
          )}
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
          element={authOnly(
            <PhoneShell>
              <FollowRequestsScreen />
            </PhoneShell>
          )}
        />
        <Route
          path="/settings/account"
          element={authOnly(
            <PhoneShell>
              <AccountManagementScreen />
            </PhoneShell>
          )}
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
        <Route path="/create-post" element={authOnly(<PhoneShell><CreatePost /></PhoneShell>)} />
        {/* Day 45: drafts and scheduled posts. */}
        <Route path="/drafts" element={authOnly(<PhoneShell><DraftsScreen /></PhoneShell>)} />
        {/* Day 47: muted accounts. */}
        <Route path="/settings/muted" element={authOnly(<PhoneShell><MutedUsersScreen /></PhoneShell>)} />
        <Route path="/settings/restricted" element={authOnly(<PhoneShell><RestrictedUsersScreen /></PhoneShell>)} />
        <Route path="/settings/close-friends" element={authOnly(<PhoneShell><CloseFriendsScreen /></PhoneShell>)} />
        <Route path="/settings/interactions" element={authOnly(<PhoneShell><InteractionsScreen /></PhoneShell>)} />
        {/* Day 48: your activity log. */}
        <Route path="/activity" element={authOnly(<PhoneShell><ActivityScreen /></PhoneShell>)} />
        {/* Day 46: one saved collection. */}
        <Route path="/saved/collections/:id" element={authOnly(<PhoneShell><CollectionScreen /></PhoneShell>)} />
        <Route path="/edit-profile" element={authOnly(<PhoneShell><EditProfile /></PhoneShell>)} />
        <Route path="/forgot-password" element={<PhoneShell hideTabBar><ForgotPassword /></PhoneShell>} />
        <Route path="/reset-password/:token" element={<PhoneShell hideTabBar><ResetPassword /></PhoneShell>} />
        <Route path="/notifications" element={authOnly(<PhoneShell><Notifications /></PhoneShell>)} />
        <Route path="/messages" element={authOnly(<PhoneShell><Messages /></PhoneShell>)} />
        <Route path="/messages/new-group" element={authOnly(<PhoneShell hideTabBar><CreateGroupScreen /></PhoneShell>)} />
        <Route path="/messages/:conversationId/info" element={authOnly(<PhoneShell hideTabBar><GroupInfoScreen /></PhoneShell>)} />
        <Route path="/messages/:conversationId" element={authOnly(<PhoneShell hideTabBar><Conversation /></PhoneShell>)} />
        <Route path="/search" element={<PhoneShell><Search /></PhoneShell>} />
        <Route path="/explore" element={<PhoneShell><ExploreScreen /></PhoneShell>} />
        <Route path="/settings/notifications" element={authOnly(<PhoneShell><NotificationSettingsScreen /></PhoneShell>)} />
        <Route path="/admin" element={authOnly(<PhoneShell><AdminScreen /></PhoneShell>)} />
        <Route path="/groups" element={authOnly(<PhoneShell><GroupsScreen /></PhoneShell>)} />
        <Route path="/groups/new" element={authOnly(<PhoneShell hideTabBar><CreateCommunityScreen /></PhoneShell>)} />
        <Route path="/groups/:id" element={<PhoneShell><CommunityScreen /></PhoneShell>} />
        <Route path="/groups/:id/manage" element={authOnly(<PhoneShell hideTabBar><ManageCommunityScreen /></PhoneShell>)} />
        <Route path="/pages" element={authOnly(<PhoneShell><PagesScreen /></PhoneShell>)} />
        <Route path="/settings/language" element={<PhoneShell><LanguageScreen /></PhoneShell>} />
        {/* C3: public landing page -- full width, deliberately NOT inside
            PhoneShell (its own Suspense instead). Logged-out "/" lands here. */}
        <Route path="/welcome" element={<Suspense fallback={null}><LandingScreen /></Suspense>} />
        {/* C2: public legal pages (no login needed). */}
        {/* Day 37: friends / followers / following -- public like profiles. */}
        <Route path="/profile/:id/connections" element={<PhoneShell><ConnectionsScreen /></PhoneShell>} />
        <Route path="/terms" element={<PhoneShell hideTabBar><LegalScreen doc="terms" /></PhoneShell>} />
        <Route path="/privacy" element={<PhoneShell hideTabBar><LegalScreen doc="privacy" /></PhoneShell>} />
        <Route path="/pages/new" element={authOnly(<PhoneShell hideTabBar><CreatePageScreen /></PhoneShell>)} />
        <Route path="/pages/:id" element={<PhoneShell><PageScreen /></PhoneShell>} />
        <Route path="/pages/:id/edit" element={authOnly(<PhoneShell hideTabBar><EditPageScreen /></PhoneShell>)} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;