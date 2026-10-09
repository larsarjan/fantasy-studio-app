import Squire from 'squire-rte'
import DOMPurify from 'dompurify'
import { articleBodyHtml, encodeArticleBody, sanitizeArticleHtml, safeLink } from '../services/articleContent.js'
import { safeHtml } from '../platform/html.js'

export function mountArticleEditor(root, body, disabled = false) {
  const node = root.querySelector('#cms-body-editor')
  const editor = new Squire(node,{blockTag:'P',sanitizeToDOMFragment:html=>DOMPurify.sanitize(sanitizeArticleHtml(html),{RETURN_DOM_FRAGMENT:true})})
  editor.setHTML(articleBodyHtml(body))
  node.setAttribute('role','textbox'); node.setAttribute('aria-multiline','true'); node.setAttribute('aria-labelledby','cms-body-label')
  node.setAttribute('contenteditable',String(!disabled))
  const toolbar = root.querySelector('#cms-editor-toolbar')
  toolbar.querySelectorAll('button').forEach(button=>{
    button.disabled = disabled
    button.onmousedown = event=>event.preventDefault()
    button.onclick = () => {
      const command = button.dataset.format
      if (['p','h2','h3'].includes(command)) {
        editor.modifyBlocks(fragment=>{
          for (const block of fragment.querySelectorAll('p,h2,h3,div')) {
            if (block.querySelector('p,h2,h3,div,ul,ol,blockquote')) continue
            const replacement = document.createElement(command)
            replacement.append(...block.childNodes); block.replaceWith(replacement)
          }
          return fragment
        }).focus()
      } else if (command === 'bold') (editor.hasFormat('B') || editor.hasFormat('STRONG') ? editor.removeBold() : editor.bold()).focus()
      else if (command === 'italic') (editor.hasFormat('I') || editor.hasFormat('EM') ? editor.removeItalic() : editor.italic()).focus()
      else if (command === 'ul') (editor.hasFormat('UL') ? editor.removeList() : editor.makeUnorderedList()).focus()
      else if (command === 'ol') (editor.hasFormat('OL') ? editor.removeList() : editor.makeOrderedList()).focus()
      else if (command === 'quote') (editor.hasFormat('BLOCKQUOTE') ? editor.decreaseQuoteLevel() : editor.increaseQuoteLevel()).focus()
      else if (command === 'link') {
        const range = editor.getSelection().cloneRange(),dialog=document.createElement('dialog')
        dialog.innerHTML = safeHtml('<form method="dialog" class="admin-form"><h2>Link toevoegen</h2><label>Webadres<input name="cms_link" type="url" placeholder="https://…" required></label><p data-link-error role="status"></p><div class="admin-actions"><button type="button" data-cancel>Annuleren</button><button type="submit" class="admin-primary">Link toevoegen</button></div></form>')
        document.querySelector('.admin-shell').append(dialog)
        dialog.querySelector('[data-cancel]').onclick=()=>dialog.close()
        dialog.querySelector('form').onsubmit=event=>{event.preventDefault();const url=safeLink(dialog.querySelector('input').value);if(!url){dialog.querySelector('[data-link-error]').textContent='Gebruik een geldig http- of https-webadres.';return}editor.setSelection(range);editor.makeLink(url).focus();dialog.close()}
        dialog.onclose=()=>dialog.remove();dialog.showModal()
      } else if (command === 'unlink') editor.removeLink().focus()
      else if (command === 'undo') editor.undo().focus()
      else if (command === 'redo') editor.redo().focus()
    }
  })
  return { body:()=>encodeArticleBody(editor.getHTML()), html:()=>sanitizeArticleHtml(editor.getHTML()), onChange:handler=>editor.addEventListener('input',handler), destroy:()=>editor.destroy() }
}
