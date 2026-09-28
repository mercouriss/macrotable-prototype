import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppFrame, DemoReset } from "./components/AppFrame";
import { BaselineBrowse, BaselineDone, BaselineMeal, BaselineRestaurant, BaselineReview, BaselineStart } from "./baseline/Baseline";
import { Orders, Profile } from "./screens/Account";
import { Configure } from "./screens/Configure";
import { Discover, RestaurantPage } from "./screens/Discover";
import { Experiment, ExperimentDone } from "./screens/Experiment";
import { Onboarding } from "./screens/Onboarding";
import { Privacy } from "./screens/Privacy";
import { RestaurantEntry } from "./screens/RestaurantEntry";
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
  const { pathname, search, hash } = useLocation();
  // Static hosting adds a trailing slash (/experiment → /experiment/). Normalise it before any
  // route or query handling runs, so assignment links keep their ?scenario= parameter intact.
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return <Navigate to={`${pathname.replace(/\/+$/, "")}${search}${hash}`} replace />;
  }
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

        {/* Research: assignment links, neutral completion, dashboard */}
        <Route path="experiment" element={<Experiment />} />
        <Route path="experiment/done" element={<ExperimentDone />} />
        <Route path="research" element={<Research />} />

        <Route path="welcome" element={<Onboarding />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="demo" element={<DemoReset />} />
        {/* Table QR landing — demo QR codes encode this URL */}
        <Route path="r/:restaurantId" element={<RestaurantEntry />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
