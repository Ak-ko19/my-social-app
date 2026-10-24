import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense } from 'react';
// Day 80: lazy screens that recover when their code can't be downloaded.
import { lazyScreen } from './utils/lazyScreen';
import PhoneShell from './components/layout/PhoneShell';
import RequireAuth from './components/auth/RequireAuth';
import HomeFeed from './screens/HomeFeed';

// Route-level code splitting (A6): only the home feed (the landing screen)
// ships in the initial bundle; every other screen loads on first visit.
// PhoneShell wraps each route in <Suspense>, so the tab bar stays put
// while a screen's chunk loads.
const Login = lazyScreen(() => import('./Login'));
const Signup = lazyScreen(() => import('./Signup'));
const CreatePost = lazyScreen(() => import('./CreatePost'));
const EditProfile = lazyScreen(() => import('./EditProfile'));
const ForgotPassword = lazyScreen(() => import('./ForgotPassword'));
const ResetPassword = lazyScreen(() => import('./ResetPassword'));
const Notifications = lazyScreen(() => import('./Notifications'));
const Messages = lazyScreen(() => import('./Messages'));
const Conversation = lazyScreen(() => import('./Conversation'));
const Search = lazyScreen(() => import('./Search'));
const MenuScreen = lazyScreen(() => import('./screens/MenuScreen'));
const SettingsScreen = lazyScreen(() => import('./screens/SettingsScreen'));
const BlockedUsersScreen = lazyScreen(() => import('./screens/BlockedUsersScreen'));
const MutedUsersScreen = lazyScreen(() => import('./screens/MutedUsersScreen'));
const RestrictedUsersScreen = lazyScreen(() => import('./screens/RestrictedUsersScreen'));
const CloseFriendsScreen = lazyScreen(() => import('./screens/CloseFriendsScreen'));
const InteractionsScreen = lazyScreen(() => import('./screens/InteractionsScreen'));
const HiddenWordsScreen = lazyScreen(() => import('./screens/HiddenWordsScreen'));
const ActivityScreen = lazyScreen(() => import('./screens/ActivityScreen'));
const SessionsScreen = lazyScreen(() => import('./screens/SessionsScreen'));
const TwoFactorScreen = lazyScreen(() => import('./screens/TwoFactorScreen'));
const OnboardingScreen = lazyScreen(() => import('./screens/OnboardingScreen'));
const MemoriesScreen = lazyScreen(() => import('./screens/MemoriesScreen'));
const SavedPostsScreen = lazyScreen(() => import('./screens/SavedPostsScreen'));
const DraftsScreen = lazyScreen(() => import('./screens/DraftsScreen'));
const CollectionScreen = lazyScreen(() => import('./screens/CollectionScreen'));
const PostDetailScreen = lazyScreen(() => import('./screens/PostDetailScreen'));
const HashtagFeedScreen = lazyScreen(() => import('./screens/HashtagFeedScreen'));
const ProfileScreen = lazyScreen(() => import('./screens/ProfileScreen'));
const FollowRequestsScreen = lazyScreen(() => import('./screens/FollowRequestsScreen'));
const AccountManagementScreen = lazyScreen(() => import('./screens/AccountManagementScreen'));
const VerifyEmailScreen = lazyScreen(() => import('./screens/VerifyEmailScreen'));
const ExploreScreen = lazyScreen(() => import('./screens/ExploreScreen'));
const CreateGroupScreen = lazyScreen(() => import('./screens/CreateGroupScreen'));
const GroupInfoScreen = lazyScreen(() => import('./screens/GroupInfoScreen'));
const NotificationSettingsScreen = lazyScreen(() => import('./screens/NotificationSettingsScreen'));
const AdminScreen = lazyScreen(() => import('./screens/AdminScreen'));
const GroupsScreen = lazyScreen(() => import('./screens/GroupsScreen'));
const CreateCommunityScreen = lazyScreen(() => import('./screens/CreateCommunityScreen'));
const CommunityScreen = lazyScreen(() => import('./screens/CommunityScreen'));
const ManageCommunityScreen = lazyScreen(() => import('./screens/ManageCommunityScreen'));
const PagesScreen = lazyScreen(() => import('./screens/PagesScreen'));
const LanguageScreen = lazyScreen(() => import('./screens/LanguageScreen'));
const LegalScreen = lazyScreen(() => import('./screens/LegalScreen'));
// Day 60: Settings > Help & Support and About (public, like /terms).
const HelpScreen = lazyScreen(() => import('./screens/HelpScreen'));
const AboutScreen = lazyScreen(() => import('./screens/AboutScreen'));
const LandingScreen = lazyScreen(() => import('./screens/LandingScreen'));
const CreatePageScreen = lazyScreen(() => import('./screens/CreatePageScreen'));
const PageScreen = lazyScreen(() => import('./screens/PageScreen'));
const EditPageScreen = lazyScreen(() => import('./screens/EditPageScreen'));
// Day 55: events.
const EventsScreen = lazyScreen(() => import('./screens/EventsScreen'));
const EventFormScreen = lazyScreen(() => import('./screens/EventFormScreen'));
const EventScreen = lazyScreen(() => import('./screens/EventScreen'));
const ConnectionsScreen = lazyScreen(() => import('./screens/ConnectionsScreen'));

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
        <Route path="/settings/hidden-words" element={authOnly(<PhoneShell><HiddenWordsScreen /></PhoneShell>)} />
        <Route path="/settings/two-factor" element={authOnly(<PhoneShell><TwoFactorScreen /></PhoneShell>)} />
        <Route path="/get-started" element={authOnly(<PhoneShell hideTabBar><OnboardingScreen /></PhoneShell>)} />
        <Route path="/memories" element={authOnly(<PhoneShell><MemoriesScreen /></PhoneShell>)} />
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
        <Route path="/help" element={<PhoneShell hideTabBar><HelpScreen /></PhoneShell>} />
        <Route path="/about" element={<PhoneShell hideTabBar><AboutScreen /></PhoneShell>} />
        <Route path="/pages/new" element={authOnly(<PhoneShell hideTabBar><CreatePageScreen /></PhoneShell>)} />
        <Route path="/pages/:id" element={<PhoneShell><PageScreen /></PhoneShell>} />
        <Route path="/pages/:id/edit" element={authOnly(<PhoneShell hideTabBar><EditPageScreen /></PhoneShell>)} />
        <Route path="/events" element={authOnly(<PhoneShell><EventsScreen /></PhoneShell>)} />
        <Route path="/events/new" element={authOnly(<PhoneShell hideTabBar><EventFormScreen /></PhoneShell>)} />
        <Route path="/events/:id" element={<PhoneShell><EventScreen /></PhoneShell>} />
        <Route path="/events/:id/edit" element={authOnly(<PhoneShell hideTabBar><EventFormScreen /></PhoneShell>)} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;