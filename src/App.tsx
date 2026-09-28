import { Navigate, Route, Routes } from "react-router-dom";
import { AppFrame } from "./components/AppFrame";
import { BaselineBrowse, BaselineDone, BaselineMeal, BaselineRestaurant, BaselineReview, BaselineStart } from "./baseline/Baseline";
import { Orders, Profile } from "./screens/Account";
import { Configure } from "./screens/Configure";
import { Discover, RestaurantPage } from "./screens/Discover";
import { Failure } from "./screens/Failure";
import { Home } from "./screens/Home";
import { MealDetail } from "./screens/MealDetail";
import { NotFound } from "./screens/NotFound";
import { Preferences } from "./screens/Preferences";
import { Research } from "./screens/Research";
import { Results } from "./screens/Results";
import { Review } from "./screens/Review";
import { Scan } from "./screens/Scan";
import { Search } from "./screens/Search";
import { Success, Ticket } from "./screens/Success";

export function App() {
  return (
    <Routes>
      <Route element={<AppFrame />}>
        <Route index element={<Navigate to="/macrotable" replace />} />

        {/* Treatment: MacroTable-assisted ordering */}
        <Route path="macrotable">
          <Route index element={<Home />} />
          <Route path="preferences" element={<Preferences />} />
          <Route path="search" element={<Search />} />
          <Route path="results" element={<Results />} />
          <Route path="failure" element={<Failure />} />
          <Route path="meal/:mealId" element={<MealDetail />} />
          <Route path="configure/:mealId" element={<Configure />} />
          <Route path="review" element={<Review />} />
          <Route path="success/:orderNumber" element={<Success />} />
          <Route path="ticket/:orderNumber" element={<Ticket />} />
          <Route path="scan" element={<Scan />} />
          <Route path="discover" element={<Discover />} />
          <Route path="discover/:restaurantId" element={<RestaurantPage />} />
          <Route path="orders" element={<Orders />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Control: conventional ordering baseline */}
        <Route path="baseline">
          <Route index element={<BaselineStart />} />
          <Route path="browse" element={<BaselineBrowse />} />
          <Route path="restaurant/:restaurantId" element={<BaselineRestaurant />} />
          <Route path="meal/:mealId" element={<BaselineMeal />} />
          <Route path="review" element={<BaselineReview />} />
          <Route path="done/:orderNumber" element={<BaselineDone />} />
        </Route>

        <Route path="research" element={<Research />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
