import {
  Favorite,
  getFavorites,
  getFavoritesRecent,
  getMaxRank,
  addFavorite,
  updateFavorite,
  deleteFavorite,
  markPlayed
} from './api'

// DOM Elements
const favoritesBody = document.getElementById('favorites-body') as HTMLTableSectionElement
const addBtn = document.getElementById('add-btn') as HTMLButtonElement
const viewRankBtn = document.getElementById('view-rank') as HTMLButtonElement
const viewRecentBtn = document.getElementById('view-recent') as HTMLButtonElement

const modal = document.getElementById('modal') as HTMLDivElement
const modalTitle = document.getElementById('modal-title') as HTMLHeadingElement
const albumForm = document.getElementById('album-form') as HTMLFormElement
const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement

const formId = document.getElementById('form-id') as HTMLInputElement
const formRank = document.getElementById('form-rank') as HTMLInputElement
const formTitle = document.getElementById('form-title') as HTMLInputElement
const formArtist = document.getElementById('form-artist') as HTMLInputElement
const formYear = document.getElementById('form-year') as HTMLInputElement
const formLastPlayed = document.getElementById('form-last-played') as HTMLInputElement

const deleteModal = document.getElementById('delete-modal') as HTMLDivElement
const deleteMessage = document.getElementById('delete-message') as HTMLParagraphElement
const deleteCancelBtn = document.getElementById('delete-cancel') as HTMLButtonElement
const deleteConfirmBtn = document.getElementById('delete-confirm') as HTMLButtonElement

// State
let currentView: 'rank' | 'recent' = 'rank'
let deleteTargetId: number | null = null
let draggedRow: HTMLTableRowElement | null = null

// Format date for display
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Render favorites table
function renderFavorites(favorites: Favorite[]): void {
  const isDraggable = currentView === 'rank'
  favoritesBody.innerHTML = favorites.map(f => `
    <tr data-id="${f.id}" data-rank="${f.rank}" ${isDraggable ? 'draggable="true"' : ''}>
      <td class="drag-handle">${isDraggable ? '⋮⋮ ' : ''}${f.rank}</td>
      <td>${escapeHtml(f.title)}</td>
      <td>${escapeHtml(f.artist)}</td>
      <td>${f.year ?? '-'}</td>
      <td>${formatDate(f.last_played)}</td>
      <td class="actions">
        <button class="btn btn-small played-btn" data-id="${f.id}">Played</button>
        <button class="btn btn-small edit-btn" data-id="${f.id}">Edit</button>
        <button class="btn btn-small delete-btn" data-id="${f.id}">Delete</button>
      </td>
    </tr>
  `).join('')
}

// Escape HTML to prevent XSS
function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// Load and render favorites
async function loadFavorites(): Promise<void> {
  try {
    const favorites = currentView === 'rank'
      ? await getFavorites()
      : await getFavoritesRecent()
    console.log('Loaded favorites:', favorites.length)
    renderFavorites(favorites)
  } catch (error) {
    console.error('Failed to load favorites:', error)
  }
}

// Open modal for adding
async function openAddModal(): Promise<void> {
  modalTitle.textContent = 'Add Album'
  formId.value = ''
  formTitle.value = ''
  formArtist.value = ''
  formYear.value = ''
  formLastPlayed.value = ''

  // Suggest next rank
  const maxRank = await getMaxRank()
  formRank.value = String(maxRank + 1)

  modal.classList.remove('hidden')
  formTitle.focus()
}

// Open modal for editing
function openEditModal(favorite: Favorite): void {
  modalTitle.textContent = 'Edit Album'
  formId.value = String(favorite.id)
  formRank.value = String(favorite.rank)
  formTitle.value = favorite.title
  formArtist.value = favorite.artist
  formYear.value = favorite.year ? String(favorite.year) : ''
  formLastPlayed.value = favorite.last_played ?? ''

  modal.classList.remove('hidden')
  formTitle.focus()
}

// Close modal
function closeModal(): void {
  modal.classList.add('hidden')
  albumForm.reset()
}

// Handle form submit
async function handleFormSubmit(e: Event): Promise<void> {
  e.preventDefault()

  const data = {
    rank: parseInt(formRank.value),
    title: formTitle.value.trim(),
    artist: formArtist.value.trim(),
    year: formYear.value ? parseInt(formYear.value) : undefined,
    last_played: formLastPlayed.value || undefined
  }

  const id = formId.value

  if (id) {
    await updateFavorite(parseInt(id), data)
  } else {
    await addFavorite(data)
  }

  closeModal()
  await loadFavorites()
}

// Open delete confirmation
function openDeleteModal(favorite: Favorite): void {
  deleteTargetId = favorite.id
  deleteMessage.textContent = `Are you sure you want to delete "${favorite.title}" by ${favorite.artist}?`
  deleteModal.classList.remove('hidden')
}

// Close delete modal
function closeDeleteModal(): void {
  deleteModal.classList.add('hidden')
  deleteTargetId = null
}

// Confirm delete
async function confirmDelete(): Promise<void> {
  if (deleteTargetId !== null) {
    await deleteFavorite(deleteTargetId)
    closeDeleteModal()
    await loadFavorites()
  }
}

// Handle table click events (edit, delete, played)
async function handleTableClick(e: Event): Promise<void> {
  const target = e.target as HTMLElement
  if (!target.matches('button')) return

  const id = parseInt(target.dataset.id ?? '')
  if (!id) return

  // Find the favorite in the current data
  const favorites = currentView === 'rank'
    ? await getFavorites()
    : await getFavoritesRecent()
  const favorite = favorites.find(f => f.id === id)
  if (!favorite) return

  if (target.classList.contains('edit-btn')) {
    openEditModal(favorite)
  } else if (target.classList.contains('delete-btn')) {
    openDeleteModal(favorite)
  } else if (target.classList.contains('played-btn')) {
    await markPlayed(id)
    await loadFavorites()
  }
}

// Switch view
function setView(view: 'rank' | 'recent'): void {
  currentView = view
  viewRankBtn.classList.toggle('active', view === 'rank')
  viewRecentBtn.classList.toggle('active', view === 'recent')
  loadFavorites()
}

// Drag and drop handlers
function handleDragStart(e: DragEvent): void {
  const row = (e.target as HTMLElement).closest('tr') as HTMLTableRowElement
  if (!row || currentView !== 'rank') return

  draggedRow = row
  row.classList.add('dragging')
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData('text/plain', row.dataset.id!)
}

function handleDragOver(e: DragEvent): void {
  e.preventDefault()
  if (!draggedRow || currentView !== 'rank') return

  const row = (e.target as HTMLElement).closest('tr') as HTMLTableRowElement
  if (!row || row === draggedRow) return

  e.dataTransfer!.dropEffect = 'move'

  // Remove existing drop indicators
  favoritesBody.querySelectorAll('tr').forEach(r => {
    r.classList.remove('drop-above', 'drop-below')
  })

  // Add indicator based on mouse position
  const rect = row.getBoundingClientRect()
  const midpoint = rect.top + rect.height / 2
  if (e.clientY < midpoint) {
    row.classList.add('drop-above')
  } else {
    row.classList.add('drop-below')
  }
}

function handleDragEnd(): void {
  if (draggedRow) {
    draggedRow.classList.remove('dragging')
  }
  draggedRow = null
  favoritesBody.querySelectorAll('tr').forEach(r => {
    r.classList.remove('drop-above', 'drop-below')
  })
}

async function handleDrop(e: DragEvent): Promise<void> {
  e.preventDefault()
  if (!draggedRow || currentView !== 'rank') return

  const targetRow = (e.target as HTMLElement).closest('tr') as HTMLTableRowElement
  if (!targetRow || targetRow === draggedRow) {
    handleDragEnd()
    return
  }

  const draggedId = parseInt(draggedRow.dataset.id!)
  const targetRank = parseInt(targetRow.dataset.rank!)

  // Determine if dropping above or below target
  const rect = targetRow.getBoundingClientRect()
  const midpoint = rect.top + rect.height / 2
  const newRank = e.clientY < midpoint ? targetRank : targetRank + 1

  handleDragEnd()

  // Update the rank via API
  await updateFavorite(draggedId, { rank: newRank })
  await loadFavorites()
}

// Event listeners
addBtn.addEventListener('click', openAddModal)
cancelBtn.addEventListener('click', closeModal)
albumForm.addEventListener('submit', handleFormSubmit)
favoritesBody.addEventListener('click', handleTableClick)
favoritesBody.addEventListener('dragstart', handleDragStart)
favoritesBody.addEventListener('dragover', handleDragOver)
favoritesBody.addEventListener('dragend', handleDragEnd)
favoritesBody.addEventListener('drop', handleDrop)
viewRankBtn.addEventListener('click', () => setView('rank'))
viewRecentBtn.addEventListener('click', () => setView('recent'))
deleteCancelBtn.addEventListener('click', closeDeleteModal)
deleteConfirmBtn.addEventListener('click', confirmDelete)

// Close modal on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal()
    closeDeleteModal()
  }
})

// Close modal on backdrop click
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal()
})
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeDeleteModal()
})

// Initial load
loadFavorites()
