import { LevelConfig } from '../models/performance.model';

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    title: '第一关：认识流水线',
    description: '观察最简单的5条指令在5级流水线中的执行过程',
    difficulty: 'easy',
    instructions: `ADD x1, x2, x3
ADD x4, x5, x6
ADD x7, x8, x9
ADD x10, x11, x12
ADD x13, x14, x15`,
    pipelineModel: '5-stage',
    enableForwarding: false,
    enableBranchPrediction: false,
    enableTomasulo: false,
    hint: '理想情况下，每条指令在下一个周期就可以开始执行下一条',
    learningObjective: '理解流水线各阶段重叠执行的基本概念'
  },
  {
    id: 2,
    title: '第二关：算术运算序列',
    description: '运行更多算术指令，观察流水线填充效果',
    difficulty: 'easy',
    instructions: `ADDI x1, x0, 10
ADDI x2, x0, 20
ADD x3, x1, x2
SUB x4, x3, x1
AND x5, x1, x2
OR x6, x1, x2`,
    pipelineModel: '5-stage',
    enableForwarding: false,
    enableBranchPrediction: false,
    enableTomasulo: false,
    hint: '流水线启动后，每周期可以完成一条指令',
    learningObjective: '理解流水线吞吐量和延迟的区别'
  },
  {
    id: 3,
    title: '第三关：逻辑运算练习',
    description: '使用各种逻辑运算指令',
    difficulty: 'easy',
    instructions: `ADDI x1, x0, 0xFF
ADDI x2, x0, 0xAA
XOR x3, x1, x2
AND x4, x1, x2
OR x5, x1, x2
SLL x6, x1, 4
SRL x7, x2, 2`,
    pipelineModel: '5-stage',
    enableForwarding: false,
    enableBranchPrediction: false,
    enableTomasulo: false,
    hint: '注意立即数运算与寄存器运算的格式差异',
    learningObjective: '熟悉不同类型指令的执行过程'
  },
  {
    id: 4,
    title: '第四关：访存指令',
    description: '学习加载和存储指令',
    difficulty: 'easy',
    instructions: `ADDI x1, x0, 100
ADDI x2, x0, 200
SW x1, 0(x0)
SW x2, 4(x0)
LW x3, 0(x0)
LW x4, 4(x0)
ADD x5, x3, x4`,
    pipelineModel: '5-stage',
    enableForwarding: false,
    enableBranchPrediction: false,
    enableTomasulo: false,
    hint: '访存指令使用MEM阶段访问内存',
    learningObjective: '理解Load/Store指令的访存阶段作用'
  },
  {
    id: 5,
    title: '第五关：混合指令',
    description: '混合多种指令类型',
    difficulty: 'easy',
    instructions: `ADDI x1, x0, 5
ADDI x2, x0, 3
MUL x3, x1, x2
SW x3, 0(x0)
LW x4, 0(x0)
ADDI x4, x4, 10
ANDI x5, x4, 0xF`,
    pipelineModel: '5-stage',
    enableForwarding: false,
    enableBranchPrediction: false,
    enableTomasulo: false,
    hint: '乘法指令需要多个执行周期',
    learningObjective: '识别多周期指令对流水线的影响'
  },
  {
    id: 6,
    title: '第六关：RAW数据冒险',
    description: '观察最常见的写后读数据冒险',
    difficulty: 'medium',
    instructions: `ADD x1, x2, x3
ADD x4, x1, x5
ADD x6, x1, x7`,
    pipelineModel: '5-stage',
    enableForwarding: false,
    enableStallInsertion: true,
    enableBranchPrediction: false,
    enableTomasulo: false,
    hint: '第二条和第三条指令都需要x1，但x1还未被写回',
    learningObjective: '识别RAW(写后读)数据冒险'
  },
  {
    id: 7,
    title: '第七关：数据转发',
    description: '开启数据转发，对比冒险解决方案效果',
    difficulty: 'medium',
    instructions: `ADD x1, x2, x3
ADD x4, x1, x5
ADD x6, x1, x4
ADD x7, x6, x1`,
    pipelineModel: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: false,
    enableTomasulo: false,
    hint: '转发可以让数据从EX/MEM阶段直接传到下一条指令的EX阶段',
    learningObjective: '理解数据转发(旁路)如何解决RAW冒险'
  },
  {
    id: 8,
    title: '第八关：Load-Use冒险',
    description: '加载指令后立即使用，需要特殊处理',
    difficulty: 'medium',
    instructions: `LW x1, 0(x0)
ADD x2, x1, x3
ADD x4, x2, x5`,
    pipelineModel: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: false,
    enableTomasulo: false,
    hint: '加载指令的数据要到MEM阶段才能得到，即使转发也需要等一个周期',
    learningObjective: '理解Load-Use冒险是特殊的RAW冒险'
  },
  {
    id: 9,
    title: '第九关：气泡插入效果',
    description: '关闭转发，观察气泡插入带来的性能损失',
    difficulty: 'medium',
    instructions: `ADD x1, x2, x3
ADD x4, x1, x5
SUB x6, x1, x4
AND x7, x4, x6
OR x8, x6, x7`,
    pipelineModel: '5-stage',
    enableForwarding: false,
    enableStallInsertion: true,
    enableBranchPrediction: false,
    enableTomasulo: false,
    targetCpi: 3.0,
    hint: '每次冒险都需要插入气泡，CPI会显著上升',
    learningObjective: '量化气泡对流水线效率的影响'
  },
  {
    id: 10,
    title: '第十关：7级流水线',
    description: '切换到更深的流水线模型',
    difficulty: 'medium',
    instructions: `ADD x1, x2, x3
SUB x4, x5, x6
MUL x7, x1, x4
ADD x8, x7, x2
SUB x9, x8, x1`,
    pipelineModel: '7-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: false,
    enableTomasulo: false,
    hint: '7级流水线有IF1/IF2和EX1/EX2，转发路径更长',
    learningObjective: '理解超流水线对冒险的影响'
  },
  {
    id: 11,
    title: '第十一关：无条件跳转',
    description: '观察JAL指令对流水线的影响',
    difficulty: 'medium',
    instructions: `ADDI x1, x0, 1
ADDI x2, x0, 2
JAL x0, skip
ADDI x3, x0, 3
skip:
ADD x4, x1, x2`,
    pipelineModel: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: false,
    enableTomasulo: false,
    hint: '跳转指令会导致其后的指令被取消',
    learningObjective: '理解控制冒险如何产生'
  },
  {
    id: 12,
    title: '第十二关：条件分支',
    description: '观察BEQ/BNE分支指令',
    difficulty: 'medium',
    instructions: `ADDI x1, x0, 5
ADDI x2, x0, 5
BEQ x1, x2, equal
ADDI x3, x0, 0
JAL x0, end
equal:
ADDI x3, x0, 1
end:
ADD x4, x1, x3`,
    pipelineModel: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: false,
    enableTomasulo: false,
    hint: '分支跳转时需要冲刷流水线中的错误指令',
    learningObjective: '理解分支指令导致的流水线冲刷'
  },
  {
    id: 13,
    title: '第十三关：静态分支预测',
    description: '使用静态预测策略',
    difficulty: 'hard',
    instructions: `ADDI x1, x0, 0
ADDI x2, x0, 10
loop:
ADD x1, x1, x2
ADDI x2, x2, -1
BNE x2, x0, loop
ADD x3, x1, x0`,
    pipelineModel: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: true,
    branchPredictionStrategy: 'STATIC_NOT_TAKEN',
    enableTomasulo: false,
    hint: '循环中的分支总是跳转，静态预测"不跳转"会每次都预测错误',
    learningObjective: '理解静态分支预测的局限性'
  },
  {
    id: 14,
    title: '第十四关：1-bit动态预测',
    description: '使用1-bit预测器，观察上次分支结果的影响',
    difficulty: 'hard',
    instructions: `ADDI x1, x0, 0
ADDI x2, x0, 4
loop:
ADD x1, x1, x2
ADDI x2, x2, -1
BNE x2, x0, loop
ADD x3, x1, x0`,
    pipelineModel: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: true,
    branchPredictionStrategy: 'ONE_BIT',
    enableTomasulo: false,
    hint: '1-bit预测器记住上次的结果，一次错误就翻转预测',
    learningObjective: '理解动态分支预测的基本原理'
  },
  {
    id: 15,
    title: '第十五关：2-bit饱和计数器',
    description: '对比2-bit预测与1-bit预测的准确率差异',
    difficulty: 'hard',
    instructions: `ADDI x1, x0, 0
ADDI x2, x0, 10
ADDI x3, x0, 0
outer:
ADDI x4, x0, 3
inner:
ADD x1, x1, x4
ADDI x4, x4, -1
BNE x4, x0, inner
ADDI x2, x2, -1
BNE x2, x0, outer
ADD x5, x1, x3`,
    pipelineModel: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: true,
    branchPredictionStrategy: 'TWO_BIT',
    enableTomasulo: false,
    hint: '2-bit预测器需要两次同方向错误才翻转，对循环更鲁棒',
    learningObjective: '理解2-bit饱和计数器的优势'
  },
  {
    id: 16,
    title: '第十六关：超标量双发射',
    description: '每周期尝试发射两条指令',
    difficulty: 'hard',
    instructions: `ADDI x1, x0, 1
ADDI x2, x0, 2
ADDI x3, x0, 3
ADDI x4, x0, 4
ADD x5, x1, x2
ADD x6, x3, x4
MUL x7, x5, x6`,
    pipelineModel: 'superscalar-2way',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: false,
    enableTomasulo: false,
    targetIpc: 1.5,
    hint: '两条没有依赖的指令可以在同一周期发射',
    learningObjective: '理解指令级并行(ILP)的基本概念'
  },
  {
    id: 17,
    title: '第十七关：Tomasulo保留站',
    description: '观察乱序执行中的保留站分配',
    difficulty: 'expert',
    instructions: `ADDI x1, x0, 10
ADDI x2, x0, 20
ADDI x3, x0, 30
ADD x4, x1, x2
ADD x5, x2, x3
ADD x6, x4, x5`,
    pipelineModel: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: false,
    enableTomasulo: true,
    hint: '保留站可以缓冲指令，等待操作数就绪',
    learningObjective: '理解Tomasulo算法的寄存器重命名'
  },
  {
    id: 18,
    title: '第十八关：CDB广播',
    description: '观察公共数据总线的结果广播过程',
    difficulty: 'expert',
    instructions: `LW x1, 0(x0)
LW x2, 4(x0)
ADD x3, x1, x2
SUB x4, x1, x2
MUL x5, x3, x4`,
    pipelineModel: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: false,
    enableTomasulo: true,
    hint: '结果通过CDB同时广播给所有等待的保留站',
    learningObjective: '理解CDB如何实现数据转发'
  },
  {
    id: 19,
    title: '第十九关：指令重排优化',
    description: '手动重排指令以提高性能，CPI必须低于1.5',
    difficulty: 'expert',
    instructions: `LW x1, 0(x0)
ADD x2, x1, x3
LW x4, 4(x0)
ADD x5, x4, x6
LW x7, 8(x0)
ADD x8, x7, x9
ADD x10, x2, x5
ADD x11, x10, x8`,
    pipelineModel: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: false,
    enableTomasulo: false,
    targetCpi: 1.5,
    hint: '尝试把Load指令集中放在前面，让计算指令错开',
    learningObjective: '掌握指令调度优化技术'
  },
  {
    id: 20,
    title: '第二十关：综合挑战',
    description: '综合使用所有优化技术，CPI必须低于1.2',
    difficulty: 'expert',
    instructions: `ADDI x1, x0, 0
ADDI x2, x0, 100
loop:
LW x3, 0(x1)
LW x4, 4(x1)
MUL x5, x3, x4
ADD x6, x6, x5
ADDI x1, x1, 8
ADDI x2, x2, -1
BNE x2, x0, loop
SW x6, 100(x0)`,
    pipelineModel: 'superscalar-2way',
    enableForwarding: true,
    enableStallInsertion: true,
    enableBranchPrediction: true,
    branchPredictionStrategy: 'TWO_BIT',
    enableTomasulo: true,
    targetCpi: 1.2,
    targetIpc: 0.8,
    hint: '可以使用转发、分支预测和乱序执行的组合',
    learningObjective: '综合运用所有流水线优化技术'
  }
];
