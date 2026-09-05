import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Tailwind as TailwindBase,
  Text,
  pixelBasedPreset,
} from "react-email"
import * as React from "react"

// @react-email/components 1.x typuje Tailwind s návratem ReactNode, což pod
// React 19 JSX kontrolou neprojde — zúžíme typ na regulérní komponentu.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Tailwind = TailwindBase as unknown as React.FC<{
  config?: any
  children?: React.ReactNode
}>

// Sdílený vzhled e-mailů (Joober — fialová / levandule).
export function BrandShell({
  preview,
  lang = "cs",
  children,
}: {
  preview: string
  lang?: string
  children: React.ReactNode
}) {
  return (
    <Html lang={lang}>
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: {
              colors: {
                violet: "#7c3aed",
                ink: "#1b1731",
                canvas: "#e8e8f3",
                muted: "#6b6b7d",
                soft: "#4a4a58",
                orange: "#f97316",
              },
            },
          },
        }}
      >
        <Head />
        <Body className="bg-canvas font-sans">
          <Preview>{preview}</Preview>
          <Container className="mx-auto max-w-[600px] p-6">
            <Section className="pb-6">
              <Text className="m-0 text-[22px] font-bold text-violet">T&amp;G Property Care</Text>
            </Section>
            <Section className="rounded-[24px] bg-white p-10">{children}</Section>
            <Section className="pt-6 text-center">
              <Text className="m-0 text-[12px] text-muted">
                T&amp;G Property Care
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
