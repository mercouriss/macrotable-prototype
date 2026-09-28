import { Screen } from "../components/Screen";
import { ButtonLink } from "../components/ui";

export function NotFound() {
  return (
    <Screen back="/macrotable">
      <div className="flex flex-col items-center pt-24 text-center">
        <p className="text-[18px] font-semibold">Nothing here</p>
        <p className="mt-1 text-[14px] text-ink-3">This page doesn't exist in the prototype.</p>
        <div className="mt-6 w-full max-w-[220px]">
          <ButtonLink to="/macrotable">Go home</ButtonLink>
        </div>
      </div>
    </Screen>
  );
}
