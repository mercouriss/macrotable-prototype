import { useNavigate } from "react-router-dom";
import type { AgentContextRequest } from "../screens/Agent";
import { Icon } from "./Icon";

/** Contextual entry point: every "Ask MacroAgent" opens the same persistent Agent workspace with context. */
export function AskAgentButton({
  context,
  label = "Ask MacroAgent",
  variant = "secondary",
  className = "",
}: {
  context?: AgentContextRequest;
  label?: string;
  variant?: "primary" | "secondary" | "link";
  className?: string;
}) {
  const navigate = useNavigate();
  const styles = {
    primary: "min-h-12 w-full justify-center rounded-2xl bg-brand px-5 text-[15px] font-semibold text-white hover:bg-brand-hover",
    secondary: "min-h-11 w-full justify-center rounded-2xl border border-brand/30 bg-brand-soft/60 px-4 text-[14px] font-semibold text-brand hover:bg-brand-soft",
    link: "min-h-9 text-[13px] font-semibold text-brand",
  }[variant];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate("/macrotable/agent", { state: context ? { agentContext: context } : null });
      }}
      className={`inline-flex items-center gap-2 ${styles} ${className}`}
    >
      <Icon name="chat" size={17} />
      {label}
    </button>
  );
}
