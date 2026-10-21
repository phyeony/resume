// LeetCode study plan shown on /admin/study: patterns with recognition cues, one template each,
// and an easy-to-disguised ladder of problems. Progress is stored as a list of problem numbers.

/** Stored at owner/study, so checkmarks follow you between phone and laptop. */
export interface StudyProgress {
  /** Problem numbers checked off as solved. */
  solved: number[];
  updatedAt: number;
}

export type Difficulty = 'E' | 'M' | 'H';

export interface Problem {
  /** LeetCode problem number, also the progress key. */
  id: number;
  title: string;
  /** leetcode.com/problems/<slug>/ */
  slug: string;
  diff: Difficulty;
}

export interface Pattern {
  key: string;
  name: string;
  summary: string;
  cues: string[];
  /** Python; `#` comments are shown muted. */
  template: string;
  problems: Problem[];
  tip?: string;
}

export const problemUrl = (p: Problem) => `https://leetcode.com/problems/${p.slug}/`;

const p = (id: number, title: string, slug: string, diff: Difficulty): Problem => ({ id, title, slug, diff });

export const PATTERNS: Pattern[] = [
  {
    key: 'hash',
    name: 'Hash map & set',
    summary: 'Trades memory for speed: any "look it up" step goes from O(n) to O(1). Most O(n²) brute forces with an inner search loop become O(n).',
    cues: ['"contains duplicate", "seen before", "first unique"', 'Counting frequencies, anagrams, grouping', 'A pair summing to a target in an unsorted array'],
    template: `# Two Sum: store what you've seen, look up what you need
def two_sum(nums, target):
    seen = {}                      # value -> index
    for i, x in enumerate(nums):
        need = target - x
        if need in seen:
            return [seen[need], i]
        seen[x] = i
    return []`,
    problems: [
      p(217, 'Contains Duplicate', 'contains-duplicate', 'E'),
      p(242, 'Valid Anagram', 'valid-anagram', 'E'),
      p(1, 'Two Sum', 'two-sum', 'E'),
      p(49, 'Group Anagrams', 'group-anagrams', 'M'),
      p(128, 'Longest Consecutive Sequence', 'longest-consecutive-sequence', 'M'),
    ],
    tip: 'Python tools: set(), dict, collections.Counter, defaultdict(list).',
  },
  {
    key: 'two',
    name: 'Two pointers',
    summary: 'Two indexes walk the array, usually from both ends toward the middle. Each step rules out one element for good, so the scan is O(n).',
    cues: ['The array is sorted (or you can sort it)', 'Pair or triplet with a target sum', 'Palindromes, reversing, "in place", "remove duplicates"'],
    template: `# Opposite ends, on a sorted array
def pair_with_sum(nums, target):
    left, right = 0, len(nums) - 1
    while left < right:
        s = nums[left] + nums[right]
        if s == target:
            return [left, right]
        if s < target:
            left += 1              # need bigger
        else:
            right -= 1             # need smaller
    return []`,
    problems: [
      p(125, 'Valid Palindrome', 'valid-palindrome', 'E'),
      p(283, 'Move Zeroes', 'move-zeroes', 'E'),
      p(167, 'Two Sum II (sorted input)', 'two-sum-ii-input-array-is-sorted', 'M'),
      p(15, '3Sum', '3sum', 'M'),
      p(11, 'Container With Most Water', 'container-with-most-water', 'M'),
    ],
    tip: 'Variant: both pointers move the same way (a reader and a writer) for in-place edits like Move Zeroes.',
  },
  {
    key: 'window',
    name: 'Sliding window',
    summary: 'Two pointers over a contiguous range. Grow the right edge every step; shrink from the left only while the window breaks the rule.',
    cues: ['"subarray" or "substring" (contiguous)', '"longest", "shortest", "maximum sum of size k"', '"at most K distinct", "without repeating"'],
    template: `# Longest window that stays valid
def longest_valid(s):
    count = {}
    left = best = 0
    for right, ch in enumerate(s):
        count[ch] = count.get(ch, 0) + 1   # grow
        while not valid(count):           # shrink
            count[s[left]] -= 1
            left += 1
        best = max(best, right - left + 1)
    return best`,
    problems: [
      p(121, 'Best Time to Buy and Sell Stock', 'best-time-to-buy-and-sell-stock', 'E'),
      p(643, 'Maximum Average Subarray I', 'maximum-average-subarray-i', 'E'),
      p(3, 'Longest Substring Without Repeating Characters', 'longest-substring-without-repeating-characters', 'M'),
      p(209, 'Minimum Size Subarray Sum', 'minimum-size-subarray-sum', 'M'),
      p(424, 'Longest Repeating Character Replacement', 'longest-repeating-character-replacement', 'M'),
      p(567, 'Permutation in String', 'permutation-in-string', 'M'),
    ],
    tip: "Trap: with negative numbers, shrinking doesn't reliably lower the sum, so the window breaks. Use prefix sums.",
  },
  {
    key: 'prefix',
    name: 'Prefix sum',
    summary: 'Precompute running totals so any range sum is one subtraction. Pair it with a hash map to count subarrays with a given sum.',
    cues: ['"sum of range i..j", asked many times', '"subarray sum equals K", especially with negatives', '"product of array except self" (prefix × suffix)'],
    template: `# Count subarrays whose sum is k
def subarray_sum(nums, k):
    seen = {0: 1}                  # prefix -> times seen
    total = count = 0
    for x in nums:
        total += x
        count += seen.get(total - k, 0)
        seen[total] = seen.get(total, 0) + 1
    return count`,
    problems: [
      p(303, 'Range Sum Query – Immutable', 'range-sum-query-immutable', 'E'),
      p(724, 'Find Pivot Index', 'find-pivot-index', 'E'),
      p(238, 'Product of Array Except Self', 'product-of-array-except-self', 'M'),
      p(560, 'Subarray Sum Equals K', 'subarray-sum-equals-k', 'M'),
    ],
  },
  {
    key: 'stack',
    name: 'Stack & monotonic stack',
    summary: 'A stack remembers the most recent unfinished thing. A monotonic stack keeps values sorted and pops everything a new value beats, which finds the next greater element for every index in O(n).',
    cues: ['Matching brackets, nested expressions, undo', '"next greater / smaller element", "days until warmer"', '"largest rectangle", stock span'],
    template: `# Next greater element for each index
def next_greater(nums):
    ans = [-1] * len(nums)
    stack = []                 # indices, values decreasing
    for i, x in enumerate(nums):
        while stack and nums[stack[-1]] < x:
            ans[stack.pop()] = x
        stack.append(i)
    return ans`,
    problems: [
      p(20, 'Valid Parentheses', 'valid-parentheses', 'E'),
      p(155, 'Min Stack', 'min-stack', 'M'),
      p(150, 'Evaluate Reverse Polish Notation', 'evaluate-reverse-polish-notation', 'M'),
      p(496, 'Next Greater Element I', 'next-greater-element-i', 'E'),
      p(739, 'Daily Temperatures', 'daily-temperatures', 'M'),
    ],
  },
  {
    key: 'binary',
    name: 'Binary search',
    summary: 'Halve the search space each step. The big unlock: you can binary search on the answer whenever "does X work?" flips from no to yes exactly once as X grows.',
    cues: ['Sorted (or rotated sorted) input', '"must run in O(log n)"', '"minimum speed / capacity / days such that…"'],
    template: `# Smallest x in [lo, hi] where ok(x) is True
# ok looks like: F F F F T T T
def first_true(lo, hi, ok):
    while lo < hi:
        mid = (lo + hi) // 2
        if ok(mid):
            hi = mid           # mid might be the answer
        else:
            lo = mid + 1       # mid is too small
    return lo`,
    problems: [
      p(704, 'Binary Search', 'binary-search', 'E'),
      p(35, 'Search Insert Position', 'search-insert-position', 'E'),
      p(278, 'First Bad Version', 'first-bad-version', 'E'),
      p(74, 'Search a 2D Matrix', 'search-a-2d-matrix', 'M'),
      p(875, 'Koko Eating Bananas', 'koko-eating-bananas', 'M'),
      p(153, 'Find Minimum in Rotated Sorted Array', 'find-minimum-in-rotated-sorted-array', 'M'),
      p(33, 'Search in Rotated Sorted Array', 'search-in-rotated-sorted-array', 'M'),
    ],
    tip: 'Use this one template everywhere. Off-by-one bugs come from switching between styles.',
  },
  {
    key: 'list',
    name: 'Linked list: fast & slow pointers',
    summary: 'Most linked list problems are pointer bookkeeping, so draw boxes and arrows. A fast pointer moving two steps per slow step finds the middle and detects cycles.',
    cues: ['"linked list" + cycle, middle, k-th from end', 'Reverse all or part of a list', 'Merge sorted lists'],
    template: `# Reverse a list (memorize this one)
def reverse(head):
    prev = None
    while head:
        nxt = head.next
        head.next = prev
        prev, head = head, nxt
    return prev

# Middle / cycle check
slow = fast = head
while fast and fast.next:
    slow, fast = slow.next, fast.next.next
    # if slow is fast: there's a cycle`,
    problems: [
      p(206, 'Reverse Linked List', 'reverse-linked-list', 'E'),
      p(21, 'Merge Two Sorted Lists', 'merge-two-sorted-lists', 'E'),
      p(876, 'Middle of the Linked List', 'middle-of-the-linked-list', 'E'),
      p(141, 'Linked List Cycle', 'linked-list-cycle', 'E'),
      p(19, 'Remove Nth Node From End of List', 'remove-nth-node-from-end-of-list', 'M'),
      p(143, 'Reorder List', 'reorder-list', 'M'),
    ],
    tip: 'A dummy node before the head removes most "what if the head changes" special cases.',
  },
  {
    key: 'tree',
    name: 'Trees: DFS and BFS',
    summary: 'For DFS, trust the recursion: assume the call already works on both children and only decide how to combine their answers. Use BFS with a queue when the problem talks about levels.',
    cues: ['Depth, height, path sum, diameter → DFS', '"level order", "right side view", "minimum depth" → BFS', 'BST: an in-order traversal comes out sorted'],
    template: `# DFS: answer from children's answers
def depth(node):
    if not node:
        return 0
    return 1 + max(depth(node.left), depth(node.right))

# BFS: one level per loop
from collections import deque
def levels(root):
    out, q = [], deque([root] if root else [])
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node.val)
            if node.left: q.append(node.left)
            if node.right: q.append(node.right)
        out.append(level)
    return out`,
    problems: [
      p(104, 'Maximum Depth of Binary Tree', 'maximum-depth-of-binary-tree', 'E'),
      p(226, 'Invert Binary Tree', 'invert-binary-tree', 'E'),
      p(100, 'Same Tree', 'same-tree', 'E'),
      p(543, 'Diameter of Binary Tree', 'diameter-of-binary-tree', 'E'),
      p(102, 'Binary Tree Level Order Traversal', 'binary-tree-level-order-traversal', 'M'),
      p(199, 'Binary Tree Right Side View', 'binary-tree-right-side-view', 'M'),
      p(235, 'Lowest Common Ancestor of a BST', 'lowest-common-ancestor-of-a-binary-search-tree', 'M'),
      p(98, 'Validate Binary Search Tree', 'validate-binary-search-tree', 'M'),
      p(230, 'Kth Smallest Element in a BST', 'kth-smallest-element-in-a-bst', 'M'),
    ],
  },
  {
    key: 'heap',
    name: 'Heap (priority queue)',
    summary: 'A heap hands you the smallest item in O(log n) per push or pop. For the top k of anything, keep a heap of size k and evict the worst item when it grows past k.',
    cues: ['"k largest", "k smallest", "k closest", "k most frequent"', 'Merge k sorted lists', 'Repeatedly take the biggest or smallest item'],
    template: `import heapq
# k largest: min-heap of size k
def k_largest(nums, k):
    heap = []
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.heappop(heap)    # drop smallest
    return heap                    # heap[0] = kth largest

# Python only has a min-heap: push -x for a max-heap`,
    problems: [
      p(1046, 'Last Stone Weight', 'last-stone-weight', 'E'),
      p(703, 'Kth Largest Element in a Stream', 'kth-largest-element-in-a-stream', 'E'),
      p(215, 'Kth Largest Element in an Array', 'kth-largest-element-in-an-array', 'M'),
      p(347, 'Top K Frequent Elements', 'top-k-frequent-elements', 'M'),
      p(973, 'K Closest Points to Origin', 'k-closest-points-to-origin', 'M'),
    ],
  },
  {
    key: 'intervals',
    name: 'Intervals & greedy',
    summary: 'Sort by start (or end), then walk once and decide locally. Greedy means taking the best choice now and never undoing it. Test it on a tricky example before trusting it.',
    cues: ['Pairs like [start, end], meetings, overlaps', '"minimum number to remove", "maximum non-overlapping"', '"can you reach the end", maximum subarray (Kadane)'],
    template: `# Merge overlapping intervals
def merge(intervals):
    intervals.sort(key=lambda iv: iv[0])
    out = []
    for start, end in intervals:
        if out and start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out`,
    problems: [
      p(53, 'Maximum Subarray', 'maximum-subarray', 'M'),
      p(55, 'Jump Game', 'jump-game', 'M'),
      p(56, 'Merge Intervals', 'merge-intervals', 'M'),
      p(57, 'Insert Interval', 'insert-interval', 'M'),
      p(435, 'Non-overlapping Intervals', 'non-overlapping-intervals', 'M'),
    ],
  },
  {
    key: 'backtrack',
    name: 'Backtracking',
    summary: "Build a candidate one choice at a time, recurse, then undo the choice and try the next. It's brute force with structure, which is why it only fits small inputs.",
    cues: ['"return all subsets / permutations / combinations"', '"generate every valid…"', 'Small n (≤ 20) in the constraints'],
    template: `# All subsets: choose, explore, un-choose
def subsets(nums):
    out, path = [], []
    def go(start):
        out.append(path[:])       # record a copy
        for i in range(start, len(nums)):
            path.append(nums[i])   # choose
            go(i + 1)              # explore
            path.pop()             # un-choose
    go(0)
    return out`,
    problems: [
      p(78, 'Subsets', 'subsets', 'M'),
      p(46, 'Permutations', 'permutations', 'M'),
      p(39, 'Combination Sum', 'combination-sum', 'M'),
      p(17, 'Letter Combinations of a Phone Number', 'letter-combinations-of-a-phone-number', 'M'),
      p(79, 'Word Search', 'word-search', 'M'),
    ],
  },
  {
    key: 'graph',
    name: 'Graphs & grids: BFS / DFS',
    summary: 'A grid is a graph where each cell links to its four neighbors. Mark cells visited so none is processed twice. BFS finds the shortest path when every step costs the same.',
    cues: ["2D grid of '1'/'0', islands, regions, flood fill", '"connected", "reachable", nodes and edges', '"minimum steps", "spreads every minute" → BFS'],
    template: `# Count islands with DFS on a grid
def num_islands(grid):
    rows, cols = len(grid), len(grid[0])
    def sink(r, c):
        if not (0 <= r < rows and 0 <= c < cols):
            return
        if grid[r][c] != '1':
            return
        grid[r][c] = '0'            # mark visited
        for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
            sink(r + dr, c + dc)
    count = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1':
                count += 1
                sink(r, c)
    return count`,
    problems: [
      p(733, 'Flood Fill', 'flood-fill', 'E'),
      p(200, 'Number of Islands', 'number-of-islands', 'M'),
      p(695, 'Max Area of Island', 'max-area-of-island', 'M'),
      p(994, 'Rotting Oranges', 'rotting-oranges', 'M'),
      p(133, 'Clone Graph', 'clone-graph', 'M'),
      p(417, 'Pacific Atlantic Water Flow', 'pacific-atlantic-water-flow', 'M'),
    ],
    tip: 'Rotting Oranges teaches multi-source BFS: put every starting cell in the queue at once.',
  },
  {
    key: 'topo',
    name: 'Topological sort',
    summary: "Orders tasks so each comes after its prerequisites. Repeatedly take a node with no remaining prerequisites. If some nodes never get taken, there's a cycle.",
    cues: ['"prerequisites", "depends on", "must come before"', '"is it possible to finish all…"', 'Directed graph plus an ordering or cycle check'],
    template: `from collections import deque
def topo_order(n, edges):          # edge (a, b): a before b
    graph = [[] for _ in range(n)]
    indeg = [0] * n
    for a, b in edges:
        graph[a].append(b)
        indeg[b] += 1
    q = deque(i for i in range(n) if indeg[i] == 0)
    order = []
    while q:
        node = q.popleft()
        order.append(node)
        for nxt in graph[node]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                q.append(nxt)
    return order if len(order) == n else []   # [] = cycle`,
    problems: [
      p(207, 'Course Schedule', 'course-schedule', 'M'),
      p(210, 'Course Schedule II', 'course-schedule-ii', 'M'),
    ],
    tip: 'Optional next step: Union-Find for "number of connected groups" (547 Number of Provinces, 684 Redundant Connection).',
  },
  {
    key: 'dp',
    name: 'Dynamic programming',
    summary: 'Recursion that remembers answers it already computed. Work in this order: define dp[i] in plain words, write how dp[i] comes from smaller answers, set the base cases, fill the table in order.',
    cues: ['"how many ways", "minimum / maximum cost"', '"can you make / reach / break into"', 'Each step is a choice, and choices lead back to the same subproblems'],
    template: `# Coin Change: dp[a] = fewest coins to make amount a
def coin_change(coins, amount):
    INF = float('inf')
    dp = [0] + [INF] * amount      # base: 0 coins for 0
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a:
                dp[a] = min(dp[a], dp[a - c] + 1)
    return dp[amount] if dp[amount] != INF else -1`,
    problems: [
      p(70, 'Climbing Stairs', 'climbing-stairs', 'E'),
      p(746, 'Min Cost Climbing Stairs', 'min-cost-climbing-stairs', 'E'),
      p(198, 'House Robber', 'house-robber', 'M'),
      p(62, 'Unique Paths', 'unique-paths', 'M'),
      p(322, 'Coin Change', 'coin-change', 'M'),
      p(300, 'Longest Increasing Subsequence', 'longest-increasing-subsequence', 'M'),
      p(1143, 'Longest Common Subsequence', 'longest-common-subsequence', 'M'),
      p(139, 'Word Break', 'word-break', 'M'),
    ],
    tip: 'If DP feels impossible, write the plain recursive solution, add @functools.cache, and you have top-down DP.',
  },
];

/** Phrase in a problem → pattern key to try. */
export const CHEAT_SHEET: { cue: string; pattern: string; label?: string }[] = [
  { cue: '"Seen before?", duplicates, counts, anagrams, pair summing to target (unsorted)', pattern: 'hash' },
  { cue: 'Sorted array, pair or triplet with a target sum, palindrome, in-place', pattern: 'two' },
  { cue: '"Contiguous subarray" or "substring" + longest / shortest / at most K', pattern: 'window' },
  { cue: 'Many range-sum queries, "subarray sum equals K" with negatives', pattern: 'prefix' },
  { cue: 'Brackets, undo, nesting, "next greater / smaller element"', pattern: 'stack' },
  { cue: 'Sorted + "find", O(log n) required, "minimum X such that…"', pattern: 'binary' },
  { cue: 'Linked list cycle, middle node, k-th from the end, reverse', pattern: 'list' },
  { cue: 'Tree depth, path, same / symmetric, BST property', pattern: 'tree', label: 'Tree DFS' },
  { cue: 'Tree "level by level", "right side view", "minimum depth"', pattern: 'tree', label: 'Tree BFS' },
  { cue: '"k largest / smallest / closest / most frequent", merge k sorted', pattern: 'heap' },
  { cue: 'Intervals, meetings, overlaps, "minimum to remove"', pattern: 'intervals' },
  { cue: '"All subsets / permutations / combinations", n ≤ 20', pattern: 'backtrack' },
  { cue: 'Grid, islands, regions, connected components, "spreads each minute"', pattern: 'graph' },
  { cue: '"Shortest path" or "fewest steps" with equal-cost moves', pattern: 'graph', label: 'BFS' },
  { cue: 'Prerequisites, dependencies, cycle in a directed graph', pattern: 'topo' },
  { cue: '"Number of ways", "minimum cost to reach", "can you make"', pattern: 'dp' },
];

export const CONSTRAINTS: { n: string; big: string; means: string }[] = [
  { n: 'n ≤ 10', big: 'O(n!)', means: 'Every permutation (backtracking)' },
  { n: 'n ≤ 20', big: 'O(2ⁿ)', means: 'Every subset (backtracking, bitmask)' },
  { n: 'n ≤ 500', big: 'O(n³)', means: 'Triple loop, interval DP' },
  { n: 'n ≤ 5,000', big: 'O(n²)', means: 'Nested loops, 2D DP' },
  { n: 'n ≤ 10⁵–10⁶', big: 'O(n log n) or O(n)', means: 'Sort, heap, hash map, two pointers, window, prefix sum' },
  { n: 'Values up to 10⁹', big: 'O(log n)', means: 'Binary search on the answer, math' },
];

export const QUIZ: { q: string; pattern: string; why: string }[] = [
  { q: 'Return the length of the longest substring with at most two distinct characters.', pattern: 'Sliding window', why: '"Substring" + "longest" + "at most K distinct".' },
  { q: 'A sorted array was rotated at an unknown index. Find a target in O(log n).', pattern: 'Binary search', why: 'Sorted input plus an explicit O(log n) requirement.' },
  { q: 'Given n courses and prerequisite pairs, return an order to take them all, or nothing if impossible.', pattern: 'Topological sort', why: '"Prerequisites", and "impossible" means a cycle.' },
  { q: 'Return the k most common words in a list.', pattern: 'Hash map + heap', why: 'Count with a hash map; "k most" means a heap of size k.' },
  { q: 'In how many ways can a string of digits be decoded, where 1 = A … 26 = Z?', pattern: 'Dynamic programming', why: '"How many ways", and each position depends on the one or two before it.' },
  { q: 'Find the fewest steps from the top-left to the bottom-right of a land/water grid.', pattern: 'BFS on a grid', why: '"Fewest steps" with equal-cost moves.' },
  { q: "For each day's price, find how many days until a higher price.", pattern: 'Monotonic stack', why: '"Next greater element" in disguise.' },
  { q: 'Return every way to place n queens on an n×n board (n ≤ 9).', pattern: 'Backtracking', why: '"Every way" and a tiny n.' },
  { q: 'Given meeting times, find the fewest meetings to cancel so none overlap.', pattern: 'Intervals + greedy', why: 'Sort by end time; keep each meeting that starts after the last kept one ends.' },
  { q: 'Count the subarrays that sum to exactly k, when numbers can be negative.', pattern: 'Prefix sum + hash map', why: 'Negatives rule out a sliding window.' },
];

export const WEEKS: { week: number; text: string; patterns: string[] }[] = [
  { week: 1, text: 'Big-O basics, then hash maps and two pointers.', patterns: ['hash', 'two'] },
  { week: 2, text: 'Sliding window and prefix sum. Learn when to use which.', patterns: ['window', 'prefix'] },
  { week: 3, text: 'Stacks and binary search, including binary search on the answer.', patterns: ['stack', 'binary'] },
  { week: 4, text: 'Linked lists, then start trees (DFS).', patterns: ['list', 'tree'] },
  { week: 5, text: 'Finish trees (BFS, BST), then heaps and intervals.', patterns: ['tree', 'heap', 'intervals'] },
  { week: 6, text: 'Backtracking and graph / grid BFS and DFS.', patterns: ['backtrack', 'graph'] },
  { week: 7, text: 'Topological sort, then DP (1D problems first).', patterns: ['topo', 'dp'] },
  { week: 8, text: "Finish DP. Then mixed practice where you don't know the pattern in advance, plus 2–3 timed mock interviews out loud.", patterns: ['dp'] },
];

export const ALL_PROBLEMS: Problem[] = PATTERNS.flatMap((pt) => pt.problems);

/** First unsolved problem, in plan order. */
export function nextProblem(solved: ReadonlySet<number>): { pattern: Pattern; problem: Problem } | null {
  for (const pattern of PATTERNS) {
    const problem = pattern.problems.find((x) => !solved.has(x.id));
    if (problem) return { pattern, problem };
  }
  return null;
}
