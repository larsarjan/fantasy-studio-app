import { appUrl } from '../platform/client.js'
export const primaryNavigation = [['','Home'],['studio','Studio'],['ranglijsten','Ranglijsten'],['videos','Video’s'],['nieuws','Nieuws'],['community','Community'],['about','Over FVT']]
export function navigationMarkup(route) {
  return primaryNavigation.map(([path,label]) => `<a href="${appUrl(path)}" ${route === path || (path && route.startsWith(path + '/')) || (path === 'ranglijsten' && route.startsWith('prominenten')) ? 'aria-current="page"' : ''}>${label}</a>`).join('')
}
