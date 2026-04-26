export function Footer() {
  return (
    <footer className='border-t bg-background mt-auto'>
      <div className='container mx-auto px-4 py-6'>
        <p className='text-center text-sm text-muted-foreground'>
          <a
            href='https://love-days-vert.vercel.app/'
            target='_blank'
            rel='noopener noreferrer'
            className='text-primary hover:text-primary/80 underline'
          >
            Nevadí že jsem tady?
          </a>
        </p>
      </div>
    </footer>
  );
}
