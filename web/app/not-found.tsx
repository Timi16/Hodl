import { ButtonLink, Logo } from "@/components/ui/primitives";
import { VaultRing } from "@/components/ui/VaultRing";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <VaultRing className="w-[180px]" rgb="255 138 122" dot="#FF8A7A">
        <span className="font-serif text-5xl">404</span>
      </VaultRing>
      <h1 className="font-serif text-[44px] leading-none">
        Nothing locked <em className="text-faint">here.</em>
      </h1>
      <p className="text-muted">That page doesn&apos;t exist. Your escrows are safe; they live in the contract, not on this site.</p>
      <ButtonLink href="/dashboard" variant="ghost">
        Go to your overview
      </ButtonLink>
    </main>
  );
}
