export function Footer() {
  return (
    <footer className='border-t border-border/70 bg-background mt-auto'>
      <div className='container mx-auto px-4 py-10'>
        <div className='flex items-center justify-center gap-4'>
          <span className='hidden sm:block h-px w-16 bg-border' aria-hidden='true' />
          <a
            href='https://love-days-vert.vercel.app/'
            target='_blank'
            rel='noopener noreferrer'
            className='font-serif italic text-lg text-foreground hover:text-primary transition-colors'
          >
            Nevadí že jsem tady?
          </a>
          <span className='hidden sm:block h-px w-16 bg-border' aria-hidden='true' />
        </div>
      </div>
    </footer>
  );
}
