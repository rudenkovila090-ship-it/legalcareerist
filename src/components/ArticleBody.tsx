import type { ReactNode } from 'react'

// Легкая разметка внутри Article.body — без markdown-библиотеки, т.к.
// нужны только два элемента: подзаголовки разделов ("## ...") и акценты на
// важных деталях ("**...**"). Абзацы разделяются пустой строкой.
function renderInline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  )
}

export default function ArticleBody({ body }: { body: string }) {
  const blocks = body.split('\n\n').filter(Boolean)

  return (
    <div className="space-y-5 leading-relaxed text-ink/80">
      {blocks.map((block, i) => {
        if (block.startsWith('## ')) {
          return (
            <h3 key={i} className="pt-3 text-lg font-semibold text-ink first:pt-0">
              {renderInline(block.slice(3))}
            </h3>
          )
        }
        return (
          <p key={i} className="text-[15px]">
            {renderInline(block)}
          </p>
        )
      })}
    </div>
  )
}
