<template>
  <section class="page" data-module="wall">
    <header class="page-head">
      <div>
        <h2>支挡结构管理</h2>
        <p class="page-desc">维护支挡结构，围绕结构编号、所属工程、结构形式、结构长度做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="toggleCreate">登记支挡结构</button>
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

    <form v-if="showCreate" class="create-bar" @submit.prevent="submitCreate">
      <label class="filter-item">
        <span>所属工程</span>
        <input v-model="createForm['所属工程']" placeholder="必填，所属治理工程" />
      </label>
      <label class="filter-item">
        <span>结构形式</span>
        <select v-model="createForm['结构形式']">
          <option value="">请选择</option>
          <option v-for="option in formOptions" :key="option" :value="option">{{ option }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>结构长度（米）</span>
        <input v-model="createForm['结构长度']" placeholder="大于 0，最多两位小数" />
      </label>
      <label class="filter-item">
        <span>结构高度（米）</span>
        <input v-model="createForm['结构高度']" placeholder="选填" />
      </label>
      <label class="filter-item">
        <span>基础埋深（米）</span>
        <input v-model="createForm['基础埋深']" placeholder="选填" />
      </label>
      <button class="btn primary" type="submit">提交登记</button>
      <button class="btn ghost" type="button" @click="toggleCreate">取消</button>
      <p class="create-hint">同一工程已有支挡记录时，结构形式自动沿用既有记录，不用重复选择。</p>
    </form>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <select v-if="field === '结构形式'" v-model="filters[field]">
          <option value="">全部</option>
          <option v-for="option in formOptions" :key="option" :value="option">{{ option }}</option>
        </select>
        <input v-else v-model="filters[field]" :placeholder="`按${field}检索`" />
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
            <button
              v-for="action in actions"
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
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  registerWallEntry,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('wall')
// 列、动作、状态、结构形式候选统一从模块元数据取数，页面不再各自维护一份。
const columns = meta.fields
const actions = meta.actions
const statuses = meta.statuses
const formOptions = meta.fieldOptions?.['结构形式'] ?? []

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const showCreate = ref(false)
const createForm = ref<Record<string, string>>({})

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const totalLength = computed(() =>
  rows.value
    .reduce((sum, row) => sum + (Number(row['结构长度']) || 0), 0)
    .toFixed(2),
)

const statValues = computed<Record<string, string | number>>(() => ({
  施工中结构: rows.value.filter((row) => String(row.status) === '施工中').length,
  待验收结构: rows.value.filter((row) => String(row.status) === '待验收').length,
  结构总长度: totalLength.value,
}))

const stats = computed(() =>
  meta.metrics.map((label: string) => ({ label, value: statValues.value[label] ?? 0 })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  errorMessage.value = ''
  const result = downloadEntries(meta.key)
  noticeMessage.value = result.message
}

function toggleCreate() {
  showCreate.value = !showCreate.value
  createForm.value = {}
  errorMessage.value = ''
}

function submitCreate() {
  errorMessage.value = ''
  noticeMessage.value = ''
  const result = registerWallEntry(createForm.value)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  showCreate.value = false
  createForm.value = {}
  reload()
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
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '支挡结构列表读取失败'
  }
}

onMounted(reload)
</script>
