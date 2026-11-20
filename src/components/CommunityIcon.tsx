/** Small, consistent outline symbols for the community surface. */
export default function CommunityIcon({ name, className = 'h-5 w-5' }: { name: 'check' | 'close' | 'arrow'; className?: string }) {
  const path = name === 'check' ? 'm5 12 4 4L19 6' : name === 'close' ? 'm6 6 12 12M18 6 6 18' : 'M4 12h16m-6-6 6 6-6 6'
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={path} /></svg>
}
