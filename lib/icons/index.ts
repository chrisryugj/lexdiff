/**
 * 아이콘 레지스트리 - Single Source of Truth
 *
 * 모든 아이콘을 중앙에서 관리하여 라이브러리 교체 시 이 파일만 수정하면 됨
 * kebab-case 네이밍 사용 (예: "arrow-left", "check-circle")
 */
import {
  // Search & Navigation
  Search01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowLeft01Icon,  // chevron 대체
  ArrowRight02Icon, // chevron 대체
  ArrowHorizontalIcon,
  ArrowUpDownIcon,

  // Loading & Status
  Loading03Icon,
  CheckmarkCircle01Icon,
  CheckmarkCircle02Icon,
  Tick02Icon,
  AlertCircleIcon,
  HelpCircleIcon,
  Cancel01Icon,
  StopCircleIcon,
  MinusSignCircleIcon,

  // Actions
  Copy01Icon,
  Download01Icon,
  Upload01Icon,
  Delete02Icon,
  RefreshIcon,
  RotateLeft01Icon,
  RotateRight01Icon,
  RotateClockwiseIcon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  Maximize01Icon,

  // Legal
  JusticeScale01Icon,
  CourtLawIcon, // gavel 대체

  // Content & Files
  File01Icon,
  FileAttachmentIcon,
  FileSearchIcon,
  News01Icon,
  BookOpen01Icon,
  QuoteDownIcon,
  TextIcon,
  ListViewIcon,
  CheckListIcon,
  TaskDaily01Icon,
  Bookmark01Icon,
  BookmarkCheck01Icon,

  // UI Elements
  StarIcon,
  Calendar03Icon,
  Clock01Icon,
  Time01Icon,
  Settings01Icon,

  // Communication
  Chat01Icon,
  MessageQuestionIcon,

  // Special
  Brain01Icon,
  SparklesIcon,
  BulbIcon,
  AlertDiamondIcon,
  Alert01Icon,
  InformationCircleIcon,
  FlashIcon,

  // Business
  Building03Icon,
  Building01Icon,
  UserGroupIcon,
  Coins01Icon,
  DollarCircleIcon,

  // Development
  GitCompareIcon,
  ConsoleIcon,
  CodeIcon,

  // Media
  PauseIcon,
  PlayIcon,
  DragDropHorizontalIcon,

  // Devices
  KeyboardIcon,
  SmartPhone01Icon,

  // Links
  Link02Icon,
  LinkSquare02Icon,

  // Plus/Minus/Edit
  PlusSignIcon,
  MinusSignIcon,
  Edit01Icon,
  FloppyDiskIcon,

  // Measurement
  RulerIcon,

  // Clipboard
  ClipboardIcon,

  // Theme
  Moon02Icon,
  Sun01Icon,

  // Filters & Sort
  FilterIcon,

  // Chart & Stats
  ChartLineData01Icon,
  ChartHistogramIcon,
  ChartUpIcon,
  ChartDownIcon,
  Calculator01Icon,
  Award01Icon,

  // Security
  SecurityCheckIcon,
  SecurityIcon,
  LockIcon,
  SquareUnlock01Icon,

  // Thumbs
  ThumbsUpIcon,
  ThumbsDownIcon,

  // Eye
  ViewIcon,
  ViewOffIcon,

  // Database
  Database01Icon,

  // Home
  Home01Icon,

  // Users & Bots
  UserIcon,
  BotIcon,
  ChatBotIcon,

  // Shapes
  SquareIcon,
  CircleIcon,

  // Additional Edit
  Edit02Icon,
} from '@hugeicons/core-free-icons'

/**
 * 아이콘 레지스트리
 * 키: kebab-case 문자열 이름
 * 값: HugeIcons 컴포넌트
 */
export const ICON_REGISTRY = {
  // Search & Navigation
  'search': Search01Icon,
  'arrow-left': ArrowLeft02Icon,
  'arrow-right': ArrowRight01Icon,
  'arrow-down': ArrowDown01Icon,
  'arrow-up': ArrowUp01Icon,
  'chevron-left': ArrowLeft01Icon,
  'chevron-right': ArrowRight02Icon,
  'chevron-down': ArrowDown01Icon,
  'chevron-up': ArrowUp01Icon,
  'arrow-left-right': ArrowHorizontalIcon,

  // Loading & Status
  'loader': Loading03Icon,
  'check-circle': CheckmarkCircle01Icon,
  'check-circle-2': CheckmarkCircle02Icon,
  'check': Tick02Icon,
  'alert-circle': AlertCircleIcon,
  'help-circle': HelpCircleIcon,
  'x': Cancel01Icon,
  'x-circle': Cancel01Icon,
  'stop-circle': StopCircleIcon,
  'minus-circle': MinusSignCircleIcon,

  // Actions
  'copy': Copy01Icon,
  'download': Download01Icon,
  'upload': Upload01Icon,
  'trash': Delete02Icon,
  'refresh': RefreshIcon,
  'refresh-cw': RefreshIcon,
  'rotate-ccw': RotateLeft01Icon,
  'rotate-cw': RotateRight01Icon,
  'rotate-clockwise': RotateClockwiseIcon,
  'zoom-in': ZoomInAreaIcon,
  'zoom-out': ZoomOutAreaIcon,
  'maximize': Maximize01Icon,

  // Legal
  'scale': JusticeScale01Icon,
  'gavel': CourtLawIcon,

  // Content & Files
  'file': File01Icon,
  'file-text': FileAttachmentIcon,
  'file-search': FileSearchIcon,
  'file-image': File01Icon,
  'scroll-text': News01Icon,
  'book-open': BookOpen01Icon,
  'quote': QuoteDownIcon,
  'type': TextIcon,
  'list-ordered': ListViewIcon,
  'list-checks': CheckListIcon,
  'list-todo': TaskDaily01Icon,
  'bookmark': Bookmark01Icon,
  'bookmark-check': BookmarkCheck01Icon,

  // UI Elements
  'star': StarIcon,
  'calendar': Calendar03Icon,
  'clock': Clock01Icon,
  'history': Time01Icon,
  'settings': Settings01Icon,

  // Communication
  'message-square': Chat01Icon,
  'message-circle-question': MessageQuestionIcon,

  // Special
  'brain': Brain01Icon,
  'sparkles': SparklesIcon,
  'lightbulb': BulbIcon,
  'alert-triangle': AlertDiamondIcon,
  'alert-octagon': Alert01Icon,
  'info': InformationCircleIcon,
  'zap': FlashIcon,

  // Business & Buildings
  'building': Building01Icon,
  'building-2': Building03Icon,
  'landmark': Building03Icon,
  'users': UserGroupIcon,
  'coins': Coins01Icon,
  'dollar-sign': DollarCircleIcon,

  // Development
  'git-compare': GitCompareIcon,
  'git-merge': GitCompareIcon,
  'terminal': ConsoleIcon,
  'code': CodeIcon,

  // Media
  'pause': PauseIcon,
  'play': PlayIcon,
  'grip-horizontal': DragDropHorizontalIcon,

  // Devices
  'keyboard': KeyboardIcon,
  'smartphone': SmartPhone01Icon,

  // Links
  'link': Link02Icon,
  'link-2': Link02Icon,
  'external-link': LinkSquare02Icon,

  // Plus/Minus/Edit
  'plus': PlusSignIcon,
  'minus': MinusSignIcon,
  'pencil': Edit01Icon,
  'save': FloppyDiskIcon,

  // Measurement
  'ruler': RulerIcon,

  // Clipboard
  'clipboard-check': ClipboardIcon,
  'circle-help': HelpCircleIcon,

  // Theme
  'moon': Moon02Icon,
  'sun': Sun01Icon,

  // Filters
  'filter': FilterIcon,
  'arrow-down-up': ArrowUpDownIcon,

  // Charts & Stats
  'bar-chart': ChartHistogramIcon,
  'bar-chart-3': ChartHistogramIcon,
  'chart-line': ChartLineData01Icon,
  'trending-up': ChartUpIcon,
  'trending-down': ChartDownIcon,
  'calculator': Calculator01Icon,
  'award': Award01Icon,

  // Security
  'shield-check': SecurityCheckIcon,
  'shield-alert': SecurityIcon,
  'shield': SecurityIcon,
  'lock': LockIcon,
  'unlock': SquareUnlock01Icon,

  // Thumbs
  'thumbs-up': ThumbsUpIcon,
  'thumbs-down': ThumbsDownIcon,

  // Eye
  'eye': ViewIcon,
  'eye-off': ViewOffIcon,

  // Database
  'database': Database01Icon,

  // Home
  'home': Home01Icon,

  // Users & Bots
  'user': UserIcon,
  'bot': BotIcon,
  'chat-bot': ChatBotIcon,

  // Shapes
  'square': SquareIcon,
  'circle': CircleIcon,

  // Additional Edit variants
  'edit-3': Edit02Icon,
} as const

export type IconName = keyof typeof ICON_REGISTRY
export type IconType = (typeof ICON_REGISTRY)[IconName]

/**
 * lucide 아이콘 이름 → kebab-case 변환 맵
 * 기존 코드 마이그레이션 시 참조용
 */
export const LUCIDE_TO_ICON_NAME: Record<string, IconName> = {
  'Search': 'search',
  'Loader2': 'loader',
  'Check': 'check',
  'CheckCircle': 'check-circle',
  'CheckCircle2': 'check-circle-2',
  'X': 'x',
  'XIcon': 'x',
  'XCircle': 'x-circle',
  'AlertCircle': 'alert-circle',
  'HelpCircle': 'help-circle',
  'ArrowLeft': 'arrow-left',
  'ArrowRight': 'arrow-right',
  'ChevronLeft': 'chevron-left',
  'ChevronRight': 'chevron-right',
  'ChevronDown': 'chevron-down',
  'ChevronUp': 'chevron-up',
  'Copy': 'copy',
  'Download': 'download',
  'Upload': 'upload',
  'Trash2': 'trash',
  'RefreshCw': 'refresh',
  'RotateCcw': 'rotate-ccw',
  'ZoomIn': 'zoom-in',
  'ZoomOut': 'zoom-out',
  'FileText': 'file-text',
  'ScrollText': 'scroll-text',
  'BookOpen': 'book-open',
  'Quote': 'quote',
  'Star': 'star',
  'Calendar': 'calendar',
  'Clock': 'clock',
  'History': 'history',
  'Settings': 'settings',
  'MessageSquare': 'message-square',
  'Brain': 'brain',
  'Sparkles': 'sparkles',
  'Lightbulb': 'lightbulb',
  'AlertTriangle': 'alert-triangle',
  'AlertOctagon': 'alert-octagon',
  'Info': 'info',
  'Zap': 'zap',
  'Scale': 'scale',
  'Building': 'building',
  'Building2': 'building-2',
  'Landmark': 'landmark',
  'GitCompare': 'git-compare',
  'GitMerge': 'git-merge',
  'Terminal': 'terminal',
  'Code': 'code',
  'Pause': 'pause',
  'Play': 'play',
  'Keyboard': 'keyboard',
  'Smartphone': 'smartphone',
  'Link2': 'link',
  'ExternalLink': 'external-link',
  'Moon': 'moon',
  'Sun': 'sun',
  'Filter': 'filter',
  'ArrowDownUp': 'arrow-down-up',
  'ArrowUpDown': 'arrow-down-up',
  'ArrowLeftRight': 'arrow-left-right',
  'BarChart3': 'bar-chart',
  'TrendingUp': 'trending-up',
  'TrendingDown': 'trending-down',
  'Calculator': 'calculator',
  'Gavel': 'gavel',
  'Users': 'users',
  'Coins': 'coins',
  'DollarSign': 'dollar-sign',
  'ShieldCheck': 'shield-check',
  'ShieldAlert': 'shield-alert',
  'Eye': 'eye',
  'EyeOff': 'eye-off',
  'ThumbsUp': 'thumbs-up',
  'ThumbsDown': 'thumbs-down',
  'FileSearch': 'file-search',
  'ListChecks': 'list-checks',
  'ListTodo': 'list-todo',
  'ListOrdered': 'list-ordered',
  'Type': 'type',
  'Maximize2': 'maximize',
  'Minimize2': 'maximize',
  'Home': 'home',
  'Database': 'database',
  'StopCircle': 'stop-circle',
  'MinusCircle': 'minus-circle',
  'Bookmark': 'bookmark',
  'BookmarkCheck': 'bookmark-check',
  'GripHorizontal': 'grip-horizontal',
  'MessageCircleQuestion': 'message-circle-question',
  'Award': 'award',
  'FileImage': 'file-image',
  'Plus': 'plus',
  'Minus': 'minus',
  'PlusCircle': 'plus',
  'Pencil': 'pencil',
  'Edit': 'pencil',
  'Edit2': 'pencil',
  'Save': 'save',
  'Ruler': 'ruler',
  'ClipboardCheck': 'clipboard-check',
  'CircleHelp': 'circle-help',
  'RefreshCcw': 'refresh',
  'RotateCw': 'refresh',
  // Users & Bots
  'User': 'user',
  'Bot': 'bot',
  // Shapes
  'Square': 'square',
  'Circle': 'circle',
  // Edit variants
  'Edit3': 'edit-3',
  // Icons with Icon suffix
  'CheckIcon': 'check',
  'ChevronDownIcon': 'chevron-down',
  'ChevronUpIcon': 'chevron-up',
  // Arrow variants
  'ArrowUp': 'arrow-up',
  'ArrowDown': 'arrow-down',
}
