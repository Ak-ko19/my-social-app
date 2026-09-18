import { createContext } from 'react';

// Cross-cutting feed callbacks (refresh after like/unlike, remove after
// delete) that several unrelated leaf components need, without threading
// them as props through every intermediate layer (FeedList -> PostCard ->
// PostActions/PostHeader -> LikeButton/MoreButton).
const FeedActionsContext = createContext(null);

export default FeedActionsContext;
