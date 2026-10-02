<template>
  <section class="page" data-module="wall">
    <header class="page-head">
      <div>
        <h2>支挡结构管理</h2>
        <p class="page-desc">维护支挡结构，围绕结构编号、所属工程、结构形式、结构长度做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记支挡结构</button>
        <button class="btn" type="button" @click="exportRows">导出支挡结构清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>结构编号</span>
        <input v-model="filters['结构编号']" placeholder="按结构编号检索" />
      </label>
      <label class="filter-item">
        <span>所属工程</span>
        <input v-model="filters['所属工程']" placeholder="按所属工程检索" />
      </label>
      <label class="filter-item">
        <span>结构形式</span>
        <select v-model="filters['结构形式']">
          <option value="">全部结构形式</option>
          <option v-for="item in structureTypes" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openEdit(row)">编辑</button>
            <button
              v-for="action in rowActions(row)"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无支挡结构数据，可先登记支挡结构</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条支挡结构记录</span>
      <span v-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="showEditor" class="modal-backdrop" @click.self="closeEditor">
      <form class="editor-card" @submit.prevent="saveEntry">
        <h3>{{ editingId === null ? '登记支挡结构' : '编辑支挡结构' }}</h3>
        <label class="editor-field">
          <span>结构编号</span>
          <input v-model="form.结构编号" required />
        </label>
        <label class="editor-field">
          <span>所属工程</span>
          <input v-model="form.所属工程" required />
        </label>
        <label class="editor-field">
          <span>结构形式</span>
          <select v-model="form.结构形式" :disabled="editingId !== null" required>
            <option value="" disabled>请选择结构形式</option>
            <option v-for="item in structureTypes" :key="item" :value="item">{{ item }}</option>
          </select>
          <small v-if="editingId !== null">沿用既有记录里的结构形式，编辑时不回炉</small>
        </label>
        <label class="editor-field">
          <span>结构长度（米，最多两位小数）</span>
          <input v-model="form.结构长度" inputmode="decimal" step="0.01" required />
        </label>
        <label class="editor-field">
          <span>结构高度（米）</span>
          <input v-model="form.结构高度" inputmode="decimal" required />
        </label>
        <label class="editor-field">
          <span>基础埋深（米）</span>
          <input v-model="form.基础埋深" inputmode="decimal" required />
        </label>
        <label class="editor-field">
          <span>验收日期</span>
          <input v-model="form.验收日期" type="date" />
        </label>
        <p v-if="formError" class="error-text">{{ formError }}</p>
        <div class="editor-actions">
          <button class="btn" type="button" @click="closeEditor">取消</button>
          <button class="btn primary" type="submit">保存</button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  availableActions,
  createWallEntry,
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
  updateWallEntry,
} from '@/api/local-service'
import { wallStructureTypes } from '@/data/wall-catalog'
import type { EntryRow, WallFormInput } from '@/data/types'

const meta = moduleMeta('wall')
const columns = meta.fields
const statuses = meta.statuses

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const filters = ref<Record<string, string>>({ 结构编号: '', 所属工程: '', 结构形式: '' })
const structureTypes = ref(wallStructureTypes())
const showEditor = ref(false)
const editingId = ref<number | null>(null)
const formError = ref('')
const form = reactive<WallFormInput>(emptyForm())

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const stats = computed(() => [
  { label: '施工中结构', value: rows.value.filter((row) => String(row.status) === '施工中').length },
  { label: '待验收结构', value: rows.value.filter((row) => String(row.status) === '待验收').length },
  {
    label: '结构总长度（米）',
    value: rows.value.reduce((sum, row) => {
      const length = Number(row.结构长度)
      return Number.isFinite(length) ? sum + length : sum
    }, 0).toFixed(2),
  },
])

function emptyForm(): WallFormInput {
  return {
    结构编号: '',
    所属工程: '',
    结构形式: '',
    结构长度: '',
    结构高度: '',
    基础埋深: '',
    验收日期: '',
  }
}

function resetForm(): void {
  Object.assign(form, emptyForm())
  editingId.value = null
  formError.value = ''
}

function resetFilters() {
  filters.value = { 结构编号: '', 所属工程: '', 结构形式: '' }
  reload()
}

function exportRows() {
  errorMessage.value = ''
  noticeMessage.value = ''
  try {
    const result = downloadEntries(meta.key)
    noticeMessage.value = result.message
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '支挡结构清单导出失败'
  }
}

function openCreate() {
  resetForm()
  structureTypes.value = wallStructureTypes()
  showEditor.value = true
}

function openEdit(row: EntryRow) {
  resetForm()
  editingId.value = Number(row.id)
  form.结构编号 = String(row.结构编号 ?? '')
  form.所属工程 = String(row.所属工程 ?? '')
  form.结构形式 = String(row.结构形式 ?? '')
  form.结构长度 = String(row.结构长度 ?? '')
  form.结构高度 = String(row.结构高度 ?? '')
  form.基础埋深 = String(row.基础埋深 ?? '')
  form.验收日期 = String(row.验收日期 ?? '')
  structureTypes.value = wallStructureTypes()
  showEditor.value = true
}

function closeEditor() {
  showEditor.value = false
  resetForm()
}

function saveEntry() {
  formError.value = ''
  const result = editingId.value === null
    ? createWallEntry(form)
    : updateWallEntry(editingId.value, form)
  if (!result.ok) {
    formError.value = result.message
    return
  }
  closeEditor()
  reload()
}

function rowActions(row: EntryRow): string[] {
  return availableActions(meta.key, row)
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const activeFilters = Object.fromEntries(
      Object.entries(filters.value).filter(([, value]) => value.trim() !== ''),
    )
    const payload = listEntries(meta.key, activeFilters)
    rows.value = payload.items
    total.value = payload.total
    structureTypes.value = wallStructureTypes()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '支挡结构列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(15 23 42 / 45%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.editor-card {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: #fff;
  border-radius: 10px;
  padding: 18px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.editor-card h3 {
  margin: 0;
  grid-column: 1 / -1;
}

.editor-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.editor-field input,
.editor-field select {
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.editor-field small {
  color: var(--muted);
}

.editor-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.notice-text {
  color: #177245;
}
</style>
